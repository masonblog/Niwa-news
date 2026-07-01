// Daily-kline (日线) close series for sparklines.
//
// The trend chart fetches from a PRIMARY source and, when that fails, an
// automatic BACKUP source — so a single upstream outage or rate-limit no longer
// blanks the chart:
//   • Primary — Yahoo Finance chart API. One uniform endpoint keyed by a Yahoo
//     ticker (`spec.klinePrimaryId`) covers every market we track: US / HK
//     stocks, indices (^IXIC, ^HSTECH), gold futures (GC=F) and BTC (BTC-USD).
//   • Backup — the previous sources, keyed by `spec.klineId`: East Money
//     (push2his.eastmoney.com) for non-btc symbols, CoinGecko market_chart for
//     BTC. Used only when the primary refresh fails or returns nothing.
// Series are cached aggressively (config.ttl.kline) since daily bars only change
// after close — the refresh button never re-pulls history on every click.

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
 *  refresh doesn't fire one upstream request per symbol simultaneously and trip
 *  rate-limiting (which silently drops some series). */
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

/** Shared across both panels so the total in-flight kline request count is
 *  bounded regardless of how many getQuotes() calls run concurrently. */
const klineThrottle = new Throttle(config.klineConcurrency, config.klineGapMs);

interface YahooChartResp {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{ close?: (number | null)[] } | undefined>;
        adjclose?: Array<{ adjclose?: (number | null)[] } | undefined>;
      };
    }> | null;
    error?: unknown;
  };
}

/** Primary source: daily closes from Yahoo Finance's chart API. `range=3mo`
 *  yields well over `klinePoints` trading days; prefer split/dividend-adjusted
 *  closes when present (matches a real price trend) and drop null holiday gaps. */
async function yahooCloses(symbol: string): Promise<number[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    '?range=3mo&interval=1d';
  const resp = await fetchJson<YahooChartResp>(url);
  const result = resp.chart?.result?.[0];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose;
  const close = result?.indicators?.quote?.[0]?.close;
  const series = adj && adj.length ? adj : (close ?? []);
  // Yahoo uses null for holiday gaps; drop them (note Number(null) === 0, so a
  // Number()+isFinite pass would silently turn gaps into bogus 0 prices).
  return series.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/** Backup source (non-btc): daily closes from East Money. `klines` items are
 *  "date,close" strings (we request fields2=f51,f53). */
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

/** Backup source (btc): daily closes from CoinGecko market_chart. */
async function coingeckoCloses(id: string, days: number): Promise<number[]> {
  const url =
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart` +
    `?vs_currency=usd&days=${days}&interval=daily`;
  const resp = await fetchJson<CgChartResp>(url);
  return (resp.prices ?? []).map((p) => p[1]).filter((n) => Number.isFinite(n));
}

/** Try each source in order (primary → backup); the first that yields a
 *  non-empty series wins, is trimmed to klinePoints, and persisted. If every
 *  source fails or comes back empty, degrade to the last good value — in-memory
 *  first, then the disk copy that survives restarts. */
async function fetchCloses(
  key: string,
  sources: Array<() => Promise<number[]>>,
): Promise<number[]> {
  for (const source of sources) {
    try {
      const trimmed = (await source()).slice(-config.klinePoints);
      if (trimmed.length) {
        set(key, trimmed);
        void setDisk(key, trimmed);
        return trimmed;
      }
      // Empty response → treat as a miss and fall through to the next source.
    } catch {
      // This source failed → try the next one.
    }
  }
  return getStale<number[]>(key) ?? (await getDiskStale(key)) ?? [];
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

  // BTC's backup (CoinGecko) is a separate upstream — not subject to the
  // stock/index rate limit, so it doesn't go through the throttle.
  if (spec.market === 'btc') {
    return fetchCloses(key, [
      () => yahooCloses(spec.klinePrimaryId), // primary
      () => coingeckoCloses(spec.klineId, config.klinePoints), // backup
    ]);
  }

  return klineThrottle.run(async () => {
    // A queued caller for the same symbol may have filled the cache while we
    // waited — re-check before spending a request.
    const fresh = getFresh<number[]>(key, config.ttl.kline, false);
    if (fresh !== undefined) return fresh;
    return fetchCloses(key, [
      () => yahooCloses(spec.klinePrimaryId), // primary
      () => eastmoneyCloses(spec.klineId, config.klinePoints), // backup
    ]);
  });
}
