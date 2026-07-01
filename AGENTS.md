# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

A real-time monitoring dashboard (监控看板). A **Node.js + TypeScript** backend scrapes
live data and serves it as one aggregated JSON payload; a single-page frontend renders it.
The **refresh button triggers a real backend fetch + update** (not a client-side re-randomize).

Panels: 服务器负载 (host metrics) · 指数行情 (indices) · 持仓股票 (holdings) ·
36氪资讯 · The Verge · GitHub Trending.

## Commands

```bash
npm install
npm run dev            # tsx watch (hot reload) — primary dev loop
npm run build          # tsc -> dist/
npm start              # node dist/server.js  (requires build first)
npx tsc --noEmit       # typecheck only
```

There is **no test suite or linter** configured. Verify changes by running `npm run dev`
and hitting the API:

```bash
curl "http://localhost:5173/api/dashboard?force=1"   # force=1 bypasses cache TTL
```

Default port is `5173` (override with `PORT`). On Windows PowerShell, `Invoke-WebRequest`
fails in non-interactive mode — use `curl.exe` instead.

## Architecture

```
public/            Frontend (static, served by the backend)
  index.html          "Design Component" template + logic (see Frontend below)
  support.js          DC runtime (generated/vendored — DO NOT edit by hand)
src/
  server.ts           Express: static hosting + /api/dashboard + 5s metrics sampler
  aggregate.ts        Calls every source in parallel, assembles DashboardData
  cache.ts            In-memory TTL cache + rolling numeric buffers
  klineCache.ts       Disk-backed persistent cache for daily-kline series
  config.ts           Port, TTLs, timeouts, instrument lists (env-overridable)
  types.ts            DashboardData + per-panel shapes + SymbolSpec
  spark.ts            number[] -> SVG polyline points string
  format.ts http.ts   number formatting; fetch with timeout/UA helpers
  sources/
    server-metrics.ts   host CPU/mem/net via systeminformation
    verge.ts            The Verge tech Atom feed (cheerio xml)
    github.ts           scrape github.com/trending (cheerio)
    kr36.ts             36Kr information-flow API (web_news/latest)
    quotes.ts           realtime snapshot prices (Sina + CoinGecko)
    klines.ts           daily-kline close series for sparklines (Yahoo primary → East Money/CoinGecko backup)
ProtoType/         Original design prototype — reference baseline, NOT part of runtime
```

**Data flow:** `server.ts` → `aggregate.getDashboard(force)` → each `source(...)` wrapper
(TTL cache + isolated error handling) → individual `sources/*` modules. The frontend
`fetchData()` maps the JSON straight onto component state.

## Conventions & invariants

- **ESM + NodeNext.** `package.json` has `"type": "module"`; relative imports MUST use
  the `.js` extension (e.g. `import { config } from './config.js'`) even from `.ts` files.
- **Payload field names mirror the template.** The frontend template (`index.html`)
  binds `{{ x.price }}`, `{{ m.barColor }}`, `{{ h.url }}`, etc. Keep `src/types.ts` field
  names in sync with the template — renaming a field silently blanks that cell.
- **Graceful degradation is mandatory.** Every source is isolated in `aggregate.ts`: a
  failure records `errors[key]`, keeps the last good value, and never breaks the payload.
  New sources must throw on real failure (so the wrapper catches) and not return partial junk.
- **Colors** use the template's CSS vars: `var(--up,#34d399)` / `var(--down,#f87171)` /
  `var(--accent,#3ddc84)` — emit these literal strings from the backend.
- **Caching:** read/write through `cache.ts`. `?force=1` bypasses TTL but a 5s
  `minForceGap` still protects upstreams from rapid refresh clicks. The
  **daily-kline trend series** additionally persist through `klineCache.ts` to a
  JSON file (`.cache/klines.json`, override with `KLINE_CACHE_FILE`): on a cold
  start `getKlineCloses` serves the persisted chart (within `ttl.kline`) instead
  of refetching every symbol at once, and falls back to the stale disk copy when
  an upstream fails.

## How to extend

**Add an instrument** (index or holding): append a `SymbolSpec` to `config.indices` /
`config.holdings`. Required fields: `name, sub, market ('us'|'hk'|'gold'|'btc'), code`
(Sina list code for the snapshot), `klinePrimaryId` (Yahoo Finance ticker — the primary
kline source), `klineId` (backup source: East Money secid, or CoinGecko id for btc; also the
cache key), `dec`, `ccy`. Verify the `code`/`klinePrimaryId`/`klineId` against live data before
committing.

**Add a panel/source:** create `src/sources/<name>.ts` exporting an async fetcher that
throws on failure; add a `source(...)` call in `aggregate.ts`; add the field to
`DashboardData` in `types.ts`; bind it in `index.html`.

## Gotchas

- **Sina quotes** (`hq.sinajs.cn`) require `Referer: https://finance.sina.com.cn/` and
  return GBK bytes — `http.ts#fetchTextRaw` decodes as latin1 (we only read ASCII numerics).
  Field layouts differ per market; `quotes.ts` derives change from price vs prevClose
  rather than trusting a specific change-field index.
- **Kline sources (primary → backup):** `klines.ts#getKlineCloses` tries `klinePrimaryId`
  (Yahoo Finance chart API, `query1.finance.yahoo.com/v8/finance/chart/<ticker>`) first, then
  falls back to `klineId` (East Money for non-btc, CoinGecko for btc) when the primary throws
  or returns nothing. Yahoo prefers split/dividend-adjusted closes and drops `null` holiday
  gaps (`Number(null)===0`, so guard against zeroing gaps). Requests are throttled together.
- **East Money klines** (now the non-btc backup) are keyed by `secid` (`105.NVDA`, `116.03690`,
  `124.HSTECH`, `101.GC00Y`, ...). Their latest daily close matches the Sina snapshot price — a
  useful cross-check. `100.HSTECH`/`118.XAU`/`100.IXIC` return empty; the working secids are in config.
- **HSTECH primary is an ETF proxy (known):** Yahoo returns empty for the `^HSTECH` index,
  so `klinePrimaryId` for 恒生科技 uses `3033.HK` (iShares Hang Seng TECH ETF, tracks the index).
  Only the normalized sparkline shape uses it; price/pct come from Sina `rt_hkHSTECH`, and the
  backup stays EM `124.HSTECH`.
- **Gold mismatch (known):** snapshot price is Sina spot `hf_XAU`; the sparkline uses EM
  COMEX gold futures `101.GC00Y` (EM has no spot-XAU daily). Trend matches; absolute values
  differ slightly (spot vs futures).
- **Network I/O first sample is 0 Mbps** — throughput needs two samples for a delta; the
  5s background sampler fills it in. `systeminformation` reports the **host**, not cgroup
  limits, so in a container the load panel shows host metrics, not the container's quota.
- **`support.js` is the vendored DC runtime** — never hand-edit. It compiles the
  `index.html` `{{ }}` template into React (loaded from a CDN at runtime).

## Frontend (Design Component runtime)

`index.html` is a `<x-dc>` template plus a `<script data-dc-script>` class
`Component extends DCLogic`. It is served as `public/index.html` (so `/` resolves to it
directly); the runtime infers the root name from the path, falling back gracefully for
non-`.dc.html` names. Editable props live in the
`data-props` attribute: `accent`, `defaultTheme`, `autoRefresh`, `autoRefreshSec`,
`apiBase` (set when the frontend is hosted separately from the API). The initial
light/dark theme follows the visitor's OS `prefers-color-scheme` (and live-updates
with it until the user clicks the toggle); `defaultTheme` is only the fallback when
`matchMedia` is unavailable. Keep template edits
minimal — structure already matches the backend shapes; you mostly only change bindings.

## Git / PR conventions

- Branch off the relevant base; do not commit straight to `main`.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- PR body footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `node_modules/` and `dist/` are gitignored.
