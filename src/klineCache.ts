// Persistent disk-backed cache for daily-kline (日线) close series.
//
// The in-memory TTL cache (cache.ts) is fast but volatile: a process restart
// drops every series and forces a cold refetch of all ~9 symbols from East
// Money at once — exactly the burst the throttle exists to avoid. Daily bars
// only change after market close, so persisting them to disk lets a restart
// serve the last good chart instantly (within TTL) and refetch lazily.
//
// One small JSON file holds every series keyed by `kline:<klineId>`. It is
// loaded once (lazily) and kept in memory; writes are serialized and atomic
// (write-temp + rename) so a crash mid-write never corrupts the live file.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

interface DiskEntry {
  value: number[];
  at: number; // ms epoch of last successful write
}

type DiskStore = Record<string, DiskEntry>;

const file = config.klineCacheFile;

let store: DiskStore | null = null;
let loading: Promise<DiskStore> | null = null;
let writeChain: Promise<void> = Promise.resolve();

/** Load the store once; reuse the in-flight promise for concurrent callers and
 *  the resolved store thereafter. A missing or corrupt file starts empty. */
function loadStore(): Promise<DiskStore> {
  if (store) return Promise.resolve(store);
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await fs.readFile(file, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        store = parsed && typeof parsed === 'object' ? (parsed as DiskStore) : {};
      } catch {
        store = {};
      }
      return store;
    })();
  }
  return loading;
}

/** Persisted entry for `key` if present and within TTL; else undefined.
 *  Returns the entry (with its original timestamp) so callers can prime the
 *  in-memory cache without resetting freshness. */
export async function getDiskFresh(key: string, ttlMs: number): Promise<DiskEntry | undefined> {
  if (!file) return undefined;
  const s = await loadStore();
  const e = s[key];
  if (!e || !Array.isArray(e.value) || typeof e.at !== 'number') return undefined;
  if (Date.now() - e.at >= ttlMs) return undefined;
  return e;
}

/** Last persisted closes for `key` regardless of age (graceful fallback). */
export async function getDiskStale(key: string): Promise<number[] | undefined> {
  if (!file) return undefined;
  const s = await loadStore();
  const e = s[key];
  return e && Array.isArray(e.value) ? e.value : undefined;
}

/** Persist closes for `key`, stamped now. Writes are serialized and atomic. */
export async function setDisk(key: string, value: number[]): Promise<void> {
  if (!file) return;
  const s = await loadStore();
  s[key] = { value, at: Date.now() };
  // Snapshot now so the flushed bytes match this call's state even if the store
  // mutates before the queued write runs.
  const data = JSON.stringify(s);
  writeChain = writeChain.then(() => flush(data)).catch(() => {});
  return writeChain;
}

async function flush(data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, data, 'utf8');
  await fs.rename(tmp, file);
}
