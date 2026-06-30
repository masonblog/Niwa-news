// Daily-kline (日线) close series for sparklines.
//
// East Money (push2his.eastmoney.com) provides a uniform daily-kline API across
// US / HK / index / futures markets keyed by a `secid` (verified to match the
// realtime snapshot prices). BTC uses CoinGecko's market_chart. Series are
// cached aggressively (config.ttl.kline) since daily bars only change after
// close — the refresh button never re-pulls history on every click.

import type { SymbolSpec } from '../types.js';
import { config } from '../config.js';
import { fetchJson } from '../http.js';
import { getFresh, getStale, set } from '../cache.js';
import { getDiskFresh, getDiskStale, setDisk } from '../klineCache.js';

interface EmKlineResp {
  data?: { klines?: string[] } | null;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Bounds how many tasks run at once and staggers their start, so a cold-cache
 *  refresh doesn't fire one East Money request per symbol simultaneously and
 *  trip rate-limiting (which silently drops some — notably US — series). */
class Throttle {
  private active = 0;
  private waiters: Array<() => void> = [];
  private lastStart = 0;

  constructor(
    private readonly concurrency: number,
    private readonly minGapMs: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    const gap = this.minGapMs - (Date.now() - this.lastStart);
    if (gap > 0) await delay(gap);
    this.lastStart = Date.now();
    try {
      return await task();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

/** Shared across both panels so the total in-flight East Money request count is
 *  bounded regardless of how many getQuotes() calls run concurrently. */
const emThrottle = new Throttle(config.klineConcurrency, config.klineGapMs);

/** Daily closes from East Money. `klines` items are "date,close" strings
 *  (we request fields2=f51,f53). */
async function eastmoneyCloses(secid: string, lmt: number): Promise<number[]> {
  const url =
    'https://push2his.eastmoney.com/api/qt/stock/kline/get' +
    `?secid=${encodeURIComponent(secid)}&fields1=f1&fields2=f51,f53` +
    `&klt=101&fqt=1&end=20500101&lmt=${lmt}`;
  const resp = await fetchJson<EmKlineResp>(url, {
    headers: { Referer: 'https://quote.eastmoney.com/' },
  });
  const rows = resp.data?.klines ?? [];
  return rows
    .map((r) => Number(r.split(',')[1]))
    .filter((n) => Number.isFinite(n));
}

interface CgChartResp {
  prices?: [number, number][];
}

/** Daily closes from CoinGecko market_chart. */
async function coingeckoCloses(id: string, days: number): Promise<number[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart` +
    `?vs_currency=usd&days=${days}&interval=daily`;
  const resp = await fetchJson<CgChartResp>(url);
  return (resp.prices ?? []).map((p) => p[1]).filter((n) => Number.isFinite(n));
}

/** Fetch, trim, and persist closes for `key`. On failure, degrade to the last
 *  good value — in-memory first, then the disk copy that survives restarts. */
async function fetchCloses(key: string, fetcher: () => Promise<number[]>): Promise<number[]> {
  try {
    const trimmed = (await fetcher()).slice(-config.klinePoints);
    if (trimmed.length) {
      set(key, trimmed);
      void setDisk(key, trimmed);
    }
    return trimmed;
  } catch {
    return getStale<number[]>(key) ?? (await getDiskStale(key)) ?? [];
  }
}

/** Trailing daily closes for a symbol, cached by klineId. Returns [] on failure
 *  (caller falls back to the rolling intraday buffer). */
export async function getKlineCloses(spec: SymbolSpec): Promise<number[]> {
  const key = `kline:${spec.klineId}`;
  const cached = getFresh<number[]>(key, config.ttl.kline, false);
  if (cached !== undefined) return cached;

  // In-memory miss (cold start or expired TTL). A previous run may have
  // persisted this series to disk; if it's still within TTL, serve it and prime
  // the in-memory cache (preserving the original timestamp) without a fetch.
  const disk = await getDiskFresh(key, config.ttl.kline);
  if (disk !== undefined) {
    set(key, disk.value, disk.at);
    return disk.value;
  }

  // BTC (CoinGecko) is a separate upstream — not subject to East Money's rate
  // limit, so it doesn't go through the throttle.
  if (spec.market === 'btc') {
    return fetchCloses(key, () => coingeckoCloses(spec.klineId, config.klinePoints));
  }

  return emThrottle.run(async () => {
    // A queued caller for the same symbol may have filled the cache while we
    // waited — re-check before spending a request.
    const fresh = getFresh<number[]>(key, config.ttl.kline, false);
    if (fresh !== undefined) return fresh;
    return fetchCloses(key, () => eastmoneyCloses(spec.klineId, config.klinePoints));
  });
}
