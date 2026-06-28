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

interface EmKlineResp {
  data?: { klines?: string[] } | null;
}

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

/** Trailing daily closes for a symbol, cached by klineId. Returns [] on failure
 *  (caller falls back to the rolling intraday buffer). */
export async function getKlineCloses(spec: SymbolSpec): Promise<number[]> {
  const key = `kline:${spec.klineId}`;
  const cached = getFresh<number[]>(key, config.ttl.kline, false);
  if (cached !== undefined) return cached;

  try {
    const closes =
      spec.market === 'btc'
        ? await coingeckoCloses(spec.klineId, config.klinePoints)
        : await eastmoneyCloses(spec.klineId, config.klinePoints);
    const trimmed = closes.slice(-config.klinePoints);
    if (trimmed.length) set(key, trimmed);
    return trimmed;
  } catch {
    return getStale<number[]>(key) ?? [];
  }
}
