// In-memory TTL cache + rolling history buffers. Single-process only — fine for
// a personal dashboard. No external store needed.

import { config } from './config.js';

interface Entry<T> {
  value: T;
  at: number; // last successful write (ms epoch)
  lastForce: number; // last forced refetch attempt (ms epoch)
}

const entries = new Map<string, Entry<unknown>>();

/** Return cached value if it exists and (when not forcing) is within TTL.
 *  Returns undefined when the caller should refetch. */
export function getFresh<T>(key: string, ttlMs: number, force: boolean): T | undefined {
  const e = entries.get(key) as Entry<T> | undefined;
  if (!e) return undefined;
  if (force) {
    // Honour a minimum gap so rapid clicks don't hammer upstreams.
    if (Date.now() - e.lastForce < config.minForceGapMs) return e.value;
    return undefined;
  }
  if (Date.now() - e.at < ttlMs) return e.value;
  return undefined;
}

/** Last known good value regardless of freshness (used for graceful fallback). */
export function getStale<T>(key: string): T | undefined {
  return (entries.get(key) as Entry<T> | undefined)?.value;
}

export function set<T>(key: string, value: T): void {
  const prev = entries.get(key);
  entries.set(key, { value, at: Date.now(), lastForce: prev?.lastForce ?? 0 });
}

/** Record that a forced refetch was attempted now (called before fetching). */
export function markForce(key: string): void {
  const e = entries.get(key);
  if (e) e.lastForce = Date.now();
  else entries.set(key, { value: undefined, at: 0, lastForce: Date.now() });
}

// --- Rolling numeric buffers for sparklines ---

const buffers = new Map<string, number[]>();

/** Append a sample to a named rolling buffer, capped at config.sparkPoints. */
export function pushSample(key: string, value: number): number[] {
  if (!Number.isFinite(value)) return buffers.get(key) ?? [];
  const buf = buffers.get(key) ?? [];
  buf.push(value);
  while (buf.length > config.sparkPoints) buf.shift();
  buffers.set(key, buf);
  return buf;
}

export function getBuffer(key: string): number[] {
  return buffers.get(key) ?? [];
}
