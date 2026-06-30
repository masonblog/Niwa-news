# Niwa 监控看板

实时监控看板：服务器负载、指数行情、持仓股票、36氪资讯、The Verge、GitHub Trending。
前端基于 "Design Component" 运行时（`public/support.js`），数据由一个 Node.js + TypeScript
后端实时抓取并通过 `/api/dashboard` 提供。**点击刷新按钮即触发后端重新抓取并更新看板**，
同时支持可配置的定时自动刷新。

## 快速开始

```bash
npm install
npm run dev            # tsx 热重载，开发用
# 或
npm run build && npm start   # 编译到 dist/ 后以 node 运行
```

打开 http://localhost:5173/ （直接由 `public/index.html` 提供）。

## 数据源

| 面板 | 来源 |
| --- | --- |
| 服务器负载 | 本机 CPU/内存/网络 I/O（`systeminformation`） |
| 指数行情 | Sina 行情（纳指/恒生科技/现货黄金）+ CoinGecko（BTC） |
| 持仓股票 | Sina 行情（港股 + 美股） |
| The Verge | The Verge 科技板块 Atom 订阅源（cheerio xml） |
| GitHub Trending | 抓取 github.com/trending（cheerio） |
| 36氪资讯 | 36Kr 资讯信息流 API（web_news/latest） |

走势 sparkline：
- **行情/持仓** 抓取最新**日线**收盘序列绘制真实价格走势（East Money 日线 API，BTC 用
  CoinGecko market_chart），日线数据按 `TTL_KLINE_MS`（默认 30min）缓存；抓取失败时回退到
  实时价格滚动缓冲。价格/涨跌幅仍取自实时快照。
- **服务器负载** 维护滚动缓冲，随后台采样（每 5s）累积真实近期趋势。

## API

- `GET /api/dashboard` — 聚合所有面板数据（各源按 TTL 缓存）。
- `GET /api/dashboard?force=1` — 强制重抓（绕过 TTL，但保留最小间隔保护上游）。

每个源独立缓存与错误隔离：单源失败只降级对应面板（保留上次数据并在 `errors` 中标记），
不影响整体响应；前端在副标题处显示「部分数据获取失败」提示。

## 配置

通过环境变量覆盖（见 `src/config.ts`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `5173` | HTTP 端口 |
| `FETCH_TIMEOUT_MS` | `8000` | 每个上游请求超时 |
| `TTL_QUOTES_MS` / `TTL_VERGE_MS` / `TTL_GITHUB_MS` / `TTL_KR_MS` | `30s / 5min / 5min / 60s` | 各源缓存 TTL |
| `MIN_FORCE_GAP_MS` | `5000` | 强制刷新最小间隔 |
| `SAMPLER_MS` | `5000` | 后台采样间隔 |

持仓/指数标的列表在 `src/config.ts` 的 `indices` / `holdings` 中维护。

前端 props（在 `public/index.html` 的 `data-props` 中）：`accent`、`defaultTheme`、
`autoRefresh`、`autoRefreshSec`、`apiBase`（跨域部署时指向后端地址）。

## 结构

```
public/        前端（index.html + support.js）
src/
  server.ts          Express：静态托管 + /api + 后台采样器
  aggregate.ts       聚合各源，单源失败降级
  cache.ts           TTL 缓存 + 滚动 sparkline 缓冲
  config.ts          配置与标的列表
  spark.ts           数值序列 → polyline 点串
  format.ts http.ts  格式化与带超时的抓取
  sources/           server-metrics / verge / github / kr36 / quotes / klines
ProtoType/     原始设计原型（参考基线，不参与运行）
```

## 备注

GitHub Trending、36氪与 Sina 行情属页面/接口抓取，依赖其结构稳定；已通过缓存限流、单源降级与
解析兜底降低脆弱性，供个人看板使用。
