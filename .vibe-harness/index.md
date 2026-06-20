# 任务索引

<!-- 新增任务时按主题追加，格式：
## [任务名](plans/xxx.md) | [history](history/xxx.md)
- 时间：YYYY-MM-DD
- 范围：一句话描述
- 关联：相关模块/文件
-->

## [android-native-app](../.claude/plans/app-app-hazy-starfish.md) | [history](history/android-phase1-usage-display.md)
- 时间：2026-06-19
- 范围：原生 Android 版 AI 状态监控 Phase 1：项目骨架、用量显示、手动配置、后台轮询
- 关联：`android-app/**/*`

## [android-native-app-phase2](../.claude/plans/app-app-hazy-starfish.md) | [history](history/android-phase2-qr-pairing.md)
- 时间：2026-06-19
- 范围：原生 Android 版 Phase 2：桌面端 LAN 模式、二维码窗口、手机端 CameraX + ML Kit 扫码导入配置
- 关联：`src/main/main.ts`、`src/main/server.ts`、`src/main/preload.ts`、`src/renderer/src/Settings.vue`、`android-app/ui/scan/**/*`

## [android-native-app-phase3](../.claude/plans/app-app-hazy-starfish.md) | [history](history/android-phase3-lan-sync.md)
- 时间：2026-06-19
- 范围：原生 Android 版 Phase 3：LAN WebSocket 同步 Claude 项目状态、Room 缓存、ClaudeTab UI
- 关联：`android-app/data/remote/DesktopSyncClient.kt`、`android-app/ui/home/ClaudeTab.kt`、`android-app/data/local/*`

## [landing-page](../.vibe-harness/plans/landing-page.md) | [history](history/landing-page.md)
- 时间：2026-06-20
- 范围：新增公网营销落地页，Vite + Vue 3 + Tailwind CSS，响应式布局，GitHub Pages 自动部署
- 关联：`landing/**/*`、`.github/workflows/deploy-landing.yml`

## [android-native-app-phase4](../.claude/plans/app-app-hazy-starfish.md) | [history](history/android-phase4-notifications-lifecycle.md)
- 时间：2026-06-19
- 范围：原生 Android 版 Phase 4：用量阈值通知、桌面同步连接状态展示、ProcessLifecycleOwner 前台/后台优化
- 关联：`android-app/data/notification/NotificationHelper.kt`、`android-app/lifecycle/AppLifecycleObserver.kt`、`android-app/ui/home/HomeScreen.kt`

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
