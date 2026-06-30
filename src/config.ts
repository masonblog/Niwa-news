import type { SymbolSpec } from './types.js';

const num = (v: string | undefined, fallback: number): number => {
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  /** HTTP port. */
  port: num(process.env.PORT, 5173),

  /** Outbound fetch timeout (ms) for each upstream source. */
  fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 8000),

  /** Cache TTL per source (ms). A non-forced request reuses cache within TTL. */
  ttl: {
    quotes: num(process.env.TTL_QUOTES_MS, 30_000),
    verge: num(process.env.TTL_VERGE_MS, 5 * 60_000),
    github: num(process.env.TTL_GITHUB_MS, 5 * 60_000),
    kr: num(process.env.TTL_KR_MS, 60_000),
    // Daily klines only change after market close — cache aggressively so the
    // refresh button doesn't re-pull history on every click.
    kline: num(process.env.TTL_KLINE_MS, 30 * 60_000),
  },

  /** Minimum gap between forced refetches of a source (ms) — protects upstreams
   *  from rapid refresh-button clicks. */
  minForceGapMs: num(process.env.MIN_FORCE_GAP_MS, 5_000),

  /** Background sampler interval (ms) — feeds rolling spark buffers. */
  samplerMs: num(process.env.SAMPLER_MS, 5_000),

  /** Max points kept per rolling spark buffer (fallback when klines fail). */
  sparkPoints: num(process.env.SPARK_POINTS, 26),

  /** Number of trailing daily closes used to draw the price-trend sparkline. */
  klinePoints: num(process.env.KLINE_POINTS, 30),

  /** User-Agent for page/JSON scraping. */
  userAgent:
    process.env.SCRAPE_UA ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',

  /** Index instruments (指数行情 panel). */
  indices: [
    { name: '纳斯达克', sub: 'NASDAQ Composite', market: 'us', code: 'gb_ixic', klineId: '100.NDX', dec: 2, ccy: '' },
    { name: '恒生科技', sub: 'HSTECH Index', market: 'hk', code: 'rt_hkHSTECH', klineId: '124.HSTECH', dec: 2, ccy: '' },
    { name: '现货黄金', sub: 'XAU / USD', market: 'gold', code: 'hf_XAU', klineId: '101.GC00Y', dec: 2, ccy: '$' },
    { name: '比特币', sub: 'BTC / USD', market: 'btc', code: 'bitcoin', klineId: 'bitcoin', dec: 0, ccy: '$' },
  ] as SymbolSpec[],

  /** Holdings instruments (持仓股票 panel). */
  holdings: [
    { name: '美团-W', sub: '03690 · HKD', market: 'hk', code: 'rt_hk03690', klineId: '116.03690', dec: 2, ccy: 'HK$' },
    { name: '阿里巴巴-W', sub: '09988 · HKD', market: 'hk', code: 'rt_hk09988', klineId: '116.09988', dec: 2, ccy: 'HK$' },
    { name: '百度集团-SW', sub: '09888 · HKD', market: 'hk', code: 'rt_hk09888', klineId: '116.09888', dec: 2, ccy: 'HK$' },
    { name: '英伟达 NVDA', sub: 'NASDAQ · USD', market: 'us', code: 'gb_nvda', klineId: '105.NVDA', dec: 2, ccy: '$' },
    { name: '英特尔 INTC', sub: 'NASDAQ · USD', market: 'us', code: 'gb_intc', klineId: '105.INTC', dec: 2, ccy: '$' },
  ] as SymbolSpec[],
};

export const UP_COLOR = 'var(--up,#34d399)';
export const DOWN_COLOR = 'var(--down,#f87171)';
export const ACCENT_COLOR = 'var(--accent,#3ddc84)';
