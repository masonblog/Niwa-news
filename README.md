# Niwa 监控看板

实时监控看板：服务器负载、指数行情、持仓股票、Hacker News、GitHub Trending、新浪财经要闻。
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

打开 http://localhost:5173/ （会自动跳转到 `/dashboard.dc.html`）。

## 数据源

| 面板 | 来源 |
| --- | --- |
| 服务器负载 | 本机 CPU/内存/网络 I/O（`systeminformation`） |
| 指数行情 | Sina 行情（纳指/恒生科技/现货黄金）+ CoinGecko（BTC） |
| 持仓股票 | Sina 行情（港股 + 美股） |
| Hacker News | HN 官方 Firebase API |
| GitHub Trending | 抓取 github.com/trending（cheerio） |
| 新浪财经要闻 | Sina 滚动新闻 JSON API |

走势 sparkline 采用「轻量真实」策略：服务器负载与行情价格各维护一个滚动缓冲，
随后台采样（每 5s）和每次刷新逐步累积出真实近期趋势。

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
| `TTL_QUOTES_MS` / `TTL_HN_MS` / `TTL_GITHUB_MS` / `TTL_SINA_MS` | `30s / 60s / 5min / 60s` | 各源缓存 TTL |
| `MIN_FORCE_GAP_MS` | `5000` | 强制刷新最小间隔 |
| `SAMPLER_MS` | `5000` | 后台采样间隔 |

持仓/指数标的列表在 `src/config.ts` 的 `indices` / `holdings` 中维护。

前端 props（在 `public/dashboard.dc.html` 的 `data-props` 中）：`accent`、`defaultTheme`、
`autoRefresh`、`autoRefreshSec`、`apiBase`（跨域部署时指向后端地址）。

## 结构

```
public/        前端（dashboard.dc.html + support.js）
src/
  server.ts          Express：静态托管 + /api + 后台采样器
  aggregate.ts       聚合各源，单源失败降级
  cache.ts           TTL 缓存 + 滚动 sparkline 缓冲
  config.ts          配置与标的列表
  spark.ts           数值序列 → polyline 点串
  format.ts http.ts  格式化与带超时的抓取
  sources/           server-metrics / hackernews / github / sina-news / quotes
ProtoType/     原始设计原型（参考基线，不参与运行）
```

## 备注

GitHub Trending 与 Sina 属页面/接口抓取，依赖其结构稳定；已通过缓存限流、单源降级与
解析兜底降低脆弱性，供个人看板使用。
