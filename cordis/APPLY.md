# TokenDashboard 接入 GUI

## 现状

GUI 的「Token 用量」页已经换成新版看板：KPI 卡片 + 模型用量趋势（小时 / 天 / 周 / 月，柱状 / 曲线）
+ Token 构成环形图 + 各模型花费 + Provider 占比 + 调用趋势，表格也做了美化。

看板本体由本项目 server.mjs 提供，插件只负责把它嵌进主区域。

## 两层保障

1. 静态插件（持久，刷新/重启都不丢）
   - 包：~/.dsh/profiles/web/node_modules/dsh-token-dashboard/
   - 已登记到 ~/.dsh/profiles/web/package.json 的 dsh.profile.bundles
   - 宿主半会在加载时兜底拉起看板服务
2. 动态插件（当前进程即时生效）
   - tkdash-4 / pkg-5，仅存在于当前 DSH 进程
   - 刷新页面会掉，重启 DSH 后由上面的静态插件接管

## 手动重启

    launchctl kickstart -k gui/$(id -u)/com.deepseek.dsh

## 看板服务

    cd /Users/shanglei/DSH/TokenDashboard && node server.mjs     # 127.0.0.1:8788

## 数据来源

- ~/.dsh/dsh-usage/usage-ledger.json（按天/provider/model 的 token 与花费）
- ~/.dsh/sessions/**/session.v3.jsonl.zstd（逐次调用 usage，用于小时维度）
- ~/.dsh/dsh-usage/provider-snapshots.json（余额与套餐快照）
- ~/.token-dashboard/usage-price-overrides.json（手动单价）

## 侧边栏按钮重复修复（2026-09-18）

现象：首页侧边栏的「Token 用量」按钮显示成「Token 用量 Token 用量」。

原因：宿主侧边栏 `sidebar.panellist` 的每一行由 `PanelRow` 渲染，
它把注册时传入的 `label` 作为可见标题单独渲染在图标右侧。插件的
`SidebarEntry` 是「图标（glyph）」槽位，只应画图标；旧代码在 glyph 里又渲染了一份
「Token 用量」文本，于是标签出现两次。

修复：`SidebarEntry` 改为纯图标（内联 SVG 柱状图），并保留 register 的
`label: 'Token 用量'`（可见文字、无障碍名称与折叠提示都由它提供）。
两处同步修改：

- 动态插件源码：`cordis/tkdash-client.js`（已重新写入 `cordis/upgrade.json`）
- 静态插件包：`~/.dsh/profiles/web/node_modules/dsh-token-dashboard/lib/client.js`
  （原文件备份为同目录 `client.js.bak-before-label-fix`）

注意：静态插件包的客户端 bundle 由宿主在启动时快照，改完需重启 DSH 才会生效；
在此之前正在运行的页面仍会加载旧的内存版动态插件。
