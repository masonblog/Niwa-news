// Shared shapes for the dashboard payload. Field names mirror the prototype's
// template bindings (server/indices/holdings/hn/github/kr) so the frontend
// template needs no structural changes — only its data source.

export interface ServerMetric {
  label: string;
  big: string;
  pct: number;
  barColor: string;
  spark: string; // polyline points "x,y x,y ..."
  sub: string;
}

export interface Instrument {
  name: string;
  sub: string;
  price: string;
  chg?: string; // only used by holdings in the template
  pct: string;
  up: boolean;
  spark: string;
  stroke: string;
  col: string;
}

export interface HnItem {
  rank: number;
  title: string;
  domain: string;
  points: string;
  comments: string;
  url: string;
}

export interface GithubItem {
  rank: number;
  name: string;
  desc: string;
  lang: string;
  langColor: string;
  stars: string;
  today: number;
  url: string;
}

export interface KrItem {
  rank: number;
  title: string;
  tag: string;
  time: string;
  url: string;
}

export interface DashboardData {
  lastUpdated: string;
  server: ServerMetric[];
  indices: Instrument[];
  holdings: Instrument[];
  hn: HnItem[];
  github: GithubItem[];
  kr: KrItem[];
  errors: Record<string, string>;
}

// A quote symbol described in config and resolved by quotes.ts.
export interface SymbolSpec {
  /** Display name shown in the panel. */
  name: string;
  /** Secondary line under the name. */
  sub: string;
  /** Market parser to use. */
  market: 'us' | 'hk' | 'gold' | 'btc';
  /** Sina list code (e.g. "gb_ixic", "rt_hk03690", "hf_XAU"). Ignored for btc. */
  code: string;
  /** Daily-kline identifier: an East Money secid (e.g. "105.NVDA", "116.03690",
   *  "124.HSTECH", "101.GC00Y") for non-btc symbols, or the CoinGecko coin id
   *  for btc ("bitcoin"). Drives the sparkline trend. */
  klineId: string;
  /** Decimal places for price/change formatting. */
  dec: number;
  /** Currency prefix, e.g. "$", "HK$". */
  ccy: string;
}
