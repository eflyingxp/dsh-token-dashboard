# dsh-token-dashboard

[DeepSeek Harness (DSH)](https://github.com/) 的 Token 用量看板插件：零依赖 Node 服务 + 手写 SVG 图表 + 一个把它嵌进 DSH Web GUI 的 Cordis 插件（侧边栏入口、设置页、余额/配额提醒）。

## 功能

- **消费明细看板**：KPI 卡片、模型用量趋势（小时 / 天 / 周 / 月，柱状 / 曲线）、Token 构成环形图、各模型花费 Top、Provider 占比、调用次数趋势
- **多平台余额 / 套餐监控**：DeepSeek、Moonshot（国内/国际）、Kimi For Coding、GLM Coding Plan（国内/国际）、MiniMax Coding（国内/国际）、OpenRouter、硅基流动（国内/国际）、ZenMux、火山方舟（arkcli）、手动订阅
- **提醒**：用量阈值告警、续费到期提醒，侧边栏角标 + 页面内 toast
- **API Key 自动发现**：可复用 DSH「设置 - 模型」里已配置的平台凭据，无需重复填 Key；也可在插件设置页手动填写
- **可选探测**（未配置凭据时自动隐藏，不会显示任何卡片）：
  - Codex / ChatGPT 订阅配额（通过本机 `codex app-server`，本插件不读写任何 OAuth token）
  - 阿里云百炼 token-plan 套餐（读取环境变量 `QWEN_TOKEN_PLAN_CN_API_KEY`）

## 数据来源

| 来源 | 用途 |
| --- | --- |
| `~/.dsh/dsh-usage/usage-ledger.json` | 按天 / provider / model 的 token 与花费折叠（权威） |
| `~/.dsh/dsh-usage/provider-snapshots.json` | 平台余额与套餐配额快照 |
| `~/.dsh/sessions/**/session.v3.jsonl.zstd` | 每次调用的 usage（小时维度） |
| `~/.token-dashboard/usage-price-overrides.json` | 手动补充的单价（用于估算套餐外花费） |

账本本身只有按天聚合，小时维度由 session 日志中的逐次调用 usage 折叠而来。

## 安装

要求：Node.js >= 20，DSH 已安装并在使用中（有 `~/.dsh` 目录）。

### 1. 获取代码

```sh
git clone https://github.com/eflyingxp/dsh-token-dashboard.git
```

### 2. 注册为 DSH web profile 插件

```sh
cp -r dsh-token-dashboard ~/.dsh/profiles/web/node_modules/
```

然后在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 数组里加一行：

```json
"dsh-token-dashboard",
```

插件目录本身就是一个标准 DSH 插件包（`package.json` 的 `dsh` 字段 + `cordis.patch.yml` + `lib/index.js` 宿主半 + `lib/client.js` 浏览器半）。宿主半加载时会自动从包目录拉起看板服务，路径由包自身位置推导，无需任何配置。

### 3. 重启 / 刷新 DSH

侧边栏会出现「Token 用量」入口，主区域嵌入看板页面。

### 手动运行看板服务

```sh
node server.mjs
# 打开 http://127.0.0.1:8788
```

可用环境变量 `TOKEN_DASHBOARD_PORT` / `TOKEN_DASHBOARD_HOST` 覆盖端口与监听地址。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `server.mjs` + `lib/data.mjs` + `lib/codex-quota.mjs` | 零依赖看板服务与数据层 |
| `public/` | 看板前端（手写 SVG 图表） |
| `lib/index.js` / `lib/client.js` / `cordis.patch.yml` | DSH 静态插件宿主半 / 浏览器半 / roster patch |
| `cordis/tkdash-host.js` / `cordis/tkdash-client.js` | 进阶版动态 Cordis 插件源码（多平台余额卡片、设置页、阈值告警、侧边栏角标），可在 DSH 会话里以动态插件方式加载使用 |

## 接口

- `GET /api/overview?days=7` — 总量、按天、按 provider、按模型
- `GET /api/series?dim=hour&hours=72`
- `GET /api/series?dim=day|week|month&days=30`
- `POST /api/price` — `{ model, price:{input,output,cacheRead,cacheWrite} }` 或 `{ model, clear:true }`

## 隐私说明

- 本插件不内嵌任何密钥；所有凭据来自你本机的 DSH 凭据存储或环境变量
- 看板服务只监听 `127.0.0.1`，数据不出本机
- Codex / Qwen 探测在未检测到对应凭据时完全不启用

## 说明

- 花费沿用账本价目；套餐类模型账本花费为 0，可用「价格」补充单价后计入估算
- 单价单位沿用历史看板的 USD / 1M tokens

## License

MIT
