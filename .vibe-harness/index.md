# 任务索引

<!-- 新增任务时按主题追加，格式：
## [任务名](plans/xxx.md) | [history](history/xxx.md)
- 时间：YYYY-MM-DD
- 范围：一句话描述
- 关联：相关模块/文件
-->

## [tray-menu-flatten](plans/tray-menu-flatten.md) | [history](history/tray-menu-flatten.md)
- 时间：2026-06-18
- 范围：托盘菜单拍平为单层（保留刷新周期为唯一子菜单，label 显示当前值）；README 同步
- 关联：`src/main/main.ts`、`README.md`

## [usage-bar-used-percent](plans/usage-bar-used-percent.md) | [history](history/usage-bar-used-percent.md)
- 时间：2026-06-18
- 范围：把三家 provider 的进度条/百分比统一改成「已用 %」语义，翻转 barClass 颜色阈值
- 关联：`src/main/usage-monitor.ts`、`src/renderer/src/utils/time.ts`、`src/renderer/src/components/UsageCard.vue`、`src/renderer/src/composables/useUsageState.ts`

## [configurable-threshold](plans/configurable-threshold.md) | [history](history/configurable-threshold.md)
- 时间：2026-06-18
- 范围：把 barClass / barLevel 硬编码的 warn/danger 阈值暴露为设置窗口可配置，存 config.json，WS 推送
- 关联：`src/main/config.ts`、`src/main/server.ts`、`src/renderer/src/Settings.vue`、`src/renderer/src/utils/time.ts`、`src/renderer/src/composables/useUsageState.ts`

## [fix-packaged-missing-shared](plans/fix-packaged-missing-shared.md) | [history](history/fix-packaged-missing-shared.md)
- 时间：2026-06-18
- 范围：electron-builder files 漏声明 `dist/shared/**/*`，打包后主进程 require `../shared/constants` 失败；追加该 glob 修复
- 关联：`package.json`
