# TokenDashboard

宿主 dsh-usage 账本的消费明细看板：零依赖 Node 服务 + 手写 SVG 图表。

## 数据来源

| 来源 | 用途 |
| --- | --- |
| ~/.dsh/dsh-usage/usage-ledger.json | 按天 / provider / model 的 token 与花费折叠（权威） |
| ~/.dsh/dsh-usage/provider-snapshots.json | 平台余额与套餐配额快照（平台总览） |
| ~/.dsh/.credentials.yaml + ~/.dsh/profiles/<name>/cordis.patch.yml | 供应商 API Key 自动发现（0.1.7 兜底探测，见下） |
| ~/.dsh/sessions/**/session.v3.jsonl.zstd | 每次调用的 usage（小时维度） |
| ~/.token-dashboard/usage-price-overrides.json | 手动补充的单价（用于估算套餐外花费） |

账本本身只有按天聚合，小时维度由 session 日志中的逐次调用 usage 折叠而来。

## 运行

    node server.mjs
    # 打开 http://127.0.0.1:8788

可用环境变量 TOKEN_DASHBOARD_PORT / TOKEN_DASHBOARD_HOST 覆盖端口与监听地址。

## 接口

- GET /api/overview?days=7  总量、按天、按 provider、按模型
- GET /api/series?dim=hour&hours=72
- GET /api/series?dim=day|week|month&days=30
- POST /api/price  { model, price:{input,output,cacheRead,cacheWrite} } 或 { model, clear:true }

## 图表

1. 模型用量趋势：按模型堆叠的 token 柱状图 / 多模型曲线，支持小时 / 天 / 周 / 月切换，图例可逐项开关。
2. Token 构成：输入 / 输出 / 缓存命中 / 缓存写的环形图。
3. 各模型花费：Top 8 横向条形图。
4. Provider 用量占比：横向条形图。
5. 调用次数趋势：面积迷你图。

## 说明

- 花费沿用账本价目；套餐类模型账本花费为 0，可用「价格」补充单价后计入估算。
- 单价单位沿用历史看板的 USD / 1M tokens。

## DSH 0.1.7-rc.1 兼容（平台总览兜底探测）

DSH 0.1.7-rc.1 把 `settings.yaml` 迁移进 profile patch（cordis.patch.yml）后，
宿主 dsh-usage 插件对 `llm-pi-ai` 命名空间的跨插件读取失效，会把大多数
供应商在 provider-snapshots.json 里标记为 `credential: "none"`，平台总览随之
丢失这些卡片。

`lib/providers.mjs` 兜底修复：

- 凭证自动发现：进程环境变量 → `~/.dsh/.credentials.yaml` 的 `refs:` →
  profile patch / 遗留 settings.yaml 里 `llm-pi-ai.providers.<id>.apiKeyEnv`
  映射（外加各平台惯例 env 名）。
- 对被标记 `none` 但能发现凭证的供应商，直接探测官方余额 / 配额接口
  （Moonshot、OpenRouter、硅基流动、ZenMux、Kimi Coding、GLM Coding、
  MiniMax、OpenCode Go、DeepSeek），成功则覆盖快照条目并以
  `credential: "auto"` 展示「自动发现凭证」；探测失败也会保留卡片并显示错误。
- 真正没有存任何凭证的供应商（如 kimi-coding、各家国际站未配置 key）依旧隐藏。
- 探测结果缓存 5 分钟，凭证映射缓存 1 分钟。
