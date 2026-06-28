// Quotes for 指数行情 + 持仓股票.
//
// Sina hq.sinajs.cn provides US / HK / international-gold snapshots in one batched
// `list=` call (requires a finance.sina.com.cn Referer). BTC comes from CoinGecko,
// which is more reliable than Sina for crypto. Sparklines are built from a rolling
// price buffer that grows across successive refreshes ("lightweight real").
//
// Field indices below are marked with constants so they're easy to adjust if an
// upstream layout shifts. Where possible we derive change from price vs previous
// close rather than trusting a specific change-field position.

import type { Instrument, SymbolSpec } from '../types.js';
import { config, UP_COLOR, DOWN_COLOR } from '../config.js';
import { fetchTextRaw, fetchJson } from '../http.js';
import { pushSample, getBuffer } from '../cache.js';
import { sparkLine } from '../spark.js';
import { fmt } from '../format.js';

interface Quote {
  price: number;
  prevClose: number;
}

// --- Sina line parsing ---

function parseSinaLines(body: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /var hq_str_([A-Za-z0-9_]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    map.set(m[1], m[2].split(','));
  }
  return map;
}

const n = (f: string[], i: number): number => {
  const v = Number(f[i]);
  return Number.isFinite(v) ? v : NaN;
};

// US stocks & indices: gb_xxx → [0]name [1]price [2]pct [3]time [4]change ...
function parseUs(f: string[]): Quote {
  const price = n(f, 1);
  const pct = n(f, 2);
  const prevClose = Number.isFinite(pct) ? price / (1 + pct / 100) : price;
  return { price, prevClose };
}

// HK stocks: rt_hkNNNNN → [0]en [1]cn [2]open [3]prevClose [4]high [5]low [6]price ...
function parseHkStock(f: string[]): Quote {
  return { price: n(f, 6), prevClose: n(f, 3) };
}

// HK index (rt_hkHSTECH): [0]en [1]cn [2]current [3]?? — layout differs from stocks.
// Current value sits at index 6 in observed responses; prevClose at index 3.
// Falls back to stock layout, which matches in practice for these codes.
const parseHkIndex = parseHkStock;

// International gold hf_XAU → [0]price ... [7] prev settle/close (observed).
function parseGold(f: string[]): Quote {
  const price = n(f, 0);
  const prevClose = n(f, 7);
  return { price, prevClose: Number.isFinite(prevClose) ? prevClose : price };
}

function quoteFor(spec: SymbolSpec, f: string[]): Quote {
  if (spec.market === 'gold') return parseGold(f);
  if (spec.market === 'us') return parseUs(f);
  // hk: indices vs stocks share a layout for our codes
  return spec.code.toLowerCase().includes('hstech') ? parseHkIndex(f) : parseHkStock(f);
}

// --- BTC via CoinGecko ---

async function getBtc(): Promise<Quote> {
  const data = await fetchJson<{ bitcoin: { usd: number; usd_24h_change: number } }>(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
  );
  const price = data.bitcoin.usd;
  const pct = data.bitcoin.usd_24h_change;
  return { price, prevClose: price / (1 + pct / 100) };
}

// --- Instrument assembly ---

function toInstrument(spec: SymbolSpec, q: Quote): Instrument {
  const valid = Number.isFinite(q.price) && Number.isFinite(q.prevClose) && q.prevClose !== 0;
  const price = valid ? q.price : NaN;
  const chg = valid ? price - q.prevClose : NaN;
  const pct = valid ? (chg / q.prevClose) * 100 : NaN;
  const up = !(chg < 0);

  // Grow the rolling sparkline buffer from real prices.
  const buf = Number.isFinite(price) ? pushSample(`q.${spec.code}`, price) : getBuffer(`q.${spec.code}`);
  const col = up ? UP_COLOR : DOWN_COLOR;

  const priceStr = Number.isFinite(price) ? spec.ccy + fmt(price, spec.dec) : '—';
  const chgStr = Number.isFinite(chg) ? (chg >= 0 ? '+' : '') + fmt(chg, spec.dec) : '—';
  const pctStr = Number.isFinite(pct) ? (pct >= 0 ? '+' : '') + fmt(pct, 2) + '%' : '—';

  return {
    name: spec.name,
    sub: spec.sub,
    price: priceStr,
    chg: chgStr,
    pct: pctStr,
    up,
    spark: sparkLine(buf),
    stroke: col,
    col,
  };
}

/** Fetch quotes for the given specs. Sina codes are batched; BTC is separate.
 *  Throws only if everything fails; partial results fill what's available. */
export async function getQuotes(specs: SymbolSpec[]): Promise<Instrument[]> {
  const sinaSpecs = specs.filter((s) => s.market !== 'btc');
  const btcSpecs = specs.filter((s) => s.market === 'btc');

  const quotes = new Map<string, Quote>();

  // Batched Sina request.
  if (sinaSpecs.length) {
    const list = sinaSpecs.map((s) => s.code).join(',');
    const body = await fetchTextRaw(`https://hq.sinajs.cn/list=${list}`, {
      headers: { Referer: 'https://finance.sina.com.cn/' },
    });
    const lines = parseSinaLines(body);
    for (const s of sinaSpecs) {
      const f = lines.get(s.code);
      if (f && f.length > 1) quotes.set(s.code, quoteFor(s, f));
    }
  }

  // BTC (independent; failure here shouldn't drop the rest).
  for (const s of btcSpecs) {
    try {
      quotes.set(s.code, await getBtc());
    } catch {
      /* leave btc missing → renders as "—" */
    }
  }

  if (quotes.size === 0) throw new Error('quotes: all sources failed');

  return specs.map((s) =>
    toInstrument(s, quotes.get(s.code) ?? { price: NaN, prevClose: NaN }),
  );
}
