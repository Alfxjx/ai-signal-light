# 任务索引

<!-- 新增任务时按主题追加，格式：
## [任务名](plans/xxx.md) | [history](history/xxx.md)
- 时间：YYYY-MM-DD
- 范围：一句话描述
- 关联：相关模块/文件
-->


## [opencode-usage-sidebar-redesign](plans/opencode-usage-sidebar-redesign.md) | [history](history/opencode-usage-sidebar-redesign.md)
- 时间：2026-09-29
- 范围：把 opencode TUI 用量侧边栏从「裸文本 + 手工列宽」改成 yoga flexbox 布局 + 加回进度条 + 新增可折叠栏；**侧边栏宽度不能自己测（会量到脏值导致进度条消失），一律交给布局引擎**
- 涉及：`opencode-plugin/src/{format,layout,tui}.ts(x)` + 各自 `.test.ts`、`opencode-plugin/README.md`

## [zhipu-glm-coding-plan-provider](plans/zhipu-glm-coding-plan-provider.md) ⏸️ 待开发
- 时间：2026-09-29
- 范围：**调研存档（未开工）**：智谱 GLM Coding Plan 额度查询接口形态（端点/鉴权/响应字段/解析坑）、未订阅时的行为盲区、开发前待验证清单与实施计划草案
- 关联：`.vibe-harness/plans/zhipu-glm-coding-plan-provider.md`、`src/main/usage-monitor.ts`、`src/shared/types/usage.ts`

## [opencode-usage-sidebar](plans/opencode-usage-sidebar.md) | [history](history/opencode-usage-sidebar.md)
- 时间：2026-09-28
- 范围：新增 opencode TUI 侧边栏插件（独立 npm 包 opencode-plugin/），显示 Kimi/MiniMax/火山/DeepSeek/MiMo 五家用量；凭据只读 %APPDATA%\AI状态监控\config.json；5 分钟轮询 + 失败退避 + 手动刷新
- 关联：`opencode-plugin/**`、`.gitignore`、`~/.config/opencode/plugins/usage-sidebar/tui.ts`、`docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md`

## [android-aksk-and-mimo](plans/android-aksk-and-mimo.md) | [history](history/android-aksk-and-mimo.md)
- 时间：2026-09-28
- 范围：安卓端火山接入 AK/SK 官方 OpenAPI（与桌面共用同一套官方测试向量，Cookie 降级回退）；新增 MiMo 余额 provider；修安卓侧 cookie jar 只回写 csrfToken 的老 bug、修重新扫码冲掉手填 AK/SK 的问题
- 关联：`android-app/.../data/remote/{VolcengineSign,VolcengineApi,MimoApi}.kt`、`android-app/.../domain/model/{AppConfig,UsageData}.kt`、`android-app/.../ui/{home/UsageTab,components/BalanceCard,settings/*,scan/ScanViewModel}.kt`、`android-app/app/src/test/.../VolcengineSignTest.kt`、`AGENTS.md`

## [tray-hover-volcengine](plans/tray-hover-volcengine.md) | [history](history/tray-hover-volcengine.md)
- 时间：2026-09-28
- 范围：托盘「用量速览」补上火山 Ark Coding Plan（session/weekly/monthly 三档，此前从未接入）；弹窗高度由写死 260 改为渲染层上报内容高度动态计算
- 关联：`src/renderer/src/{TrayHover.vue,composables/useUsageState.ts}`、`src/shared/types/ipc.ts`、`src/main/{main,preload}.ts`

## [volcengine-aksk](plans/volcengine-aksk.md) | [history](history/volcengine-aksk.md)
- 时间：2026-09-28
- 范围：火山 Coding Plan 额度改用官方 OpenAPI + AK/SK V4 签名（cookie 一天就过期 → 长期有效凭证，cookie 降级回退）；顺带修 cookie jar 只回写 csrfToken 的 bug；AK/SK 不下发手机端
- 关联：`src/main/{volcengine-sign,volcengine-sign.test,usage-monitor,usage-monitor.test,config,main,pairing}.ts`、`src/shared/types/{config,ipc}.ts`、`src/renderer/src/Settings.vue`、`AGENTS.md`

## [kimi-card-today-only](plans/kimi-card-today-only.md) | [history](history/kimi-card-today-only.md)
- 时间：2026-09-28
- 范围：主面板「Kimi Code (web)」目录列表只显示当日活动过的项目（非空闲/pending 强留），悬浮球下拉维持 3 天窗口
- 关联：`src/renderer/src/utils/kimiFilter.ts`、`src/renderer/src/utils/kimiFilter.test.ts`、`src/renderer/src/components/KimiCard.vue`、`AGENTS.md`

## [mimo-balance-monitor](../AI代码/徐剑祥/mimo-balance-monitor.md) | [history](history/mimo-balance-monitor.md)
- 时间：2026-09-25
- 范围：新增小米 MiMo 用量 provider（余额型）：调 `platform.xiaomimimo.com/api/v1/balance`，鉴权用控制台会话 Cookie（`sk-` API Key 查不到余额）；主面板 + 托盘弹窗展示余额与赠送
- 关联：`src/shared/types/{usage,config,ipc}.ts`、`src/main/{usage-monitor,usage-monitor.test,config,main,server,pairing}.ts`、`src/renderer/src/{Settings.vue,App.vue,TrayHover.vue,components/UsageCard.vue,composables/useUsageState.ts,types/messages.ts}`

## [kimi-notify-bubble](plans/kimi-notify-bubble.md) | [history](history/kimi-notify-bubble.md)
- 时间：2026-09-20
- 范围：悬浮球 LED 右侧显示 Kimi NotifyUser 消息气泡（web 模式经 WS tool.call.* 捕获，15s 自动隐藏，窗口动态加宽）；TUI 无此通道，web 模式走官方 API
- 关联：`src/shared/types/{kimi,ipc}.ts`、`src/main/{kimi-monitor,kimi-monitor.test,main,preload}.ts`、`src/renderer/src/{FloatingBall.vue,styles/floating-ball.css}`

## [desktop-pet](plans/desktop-pet.md) | [history](history/desktop-pet.md)
- 时间：2026-09-20
- 范围：桌面宠物（独立开关，可与悬浮球共存）：粘贴画廊命令导入 Codex 素材（awesome-codex-pet slug / codex-pets.net zip / petdex.dev）、主进程磁盘素材库、官方图集播放器跟随 Kimi 状态；单击打开本地 Kimi Web（相同 URL 浏览器自动聚焦不重复开）、长按弹下拉、右键原生菜单、可拖动
- 关联：`src/main/{pet-store,pet-store.test,main,kimi-monitor,preload,config}.ts`、`src/renderer/src/{PetView.vue,pet.ts,pet.html,pet.css,pet/pet-install.ts,pet/pet-install.test.ts,pet/pet-sprites.ts,Settings.vue,styles/settings.css}`、`src/shared/types/{config,ipc}.ts`、`vite.config.ts`

## [kimi-web-status](plans/kimi-web-status.md) | [history](history/kimi-web-status.md)
- 时间：2026-09-16
- 范围：主面板新增「Kimi Code (web)」实时状态卡：连本机 kimi web 服务（WS 订阅 + REST 校准），会话按 metadata.cwd 归并成目录行，头部四态聚合（待审核>编辑>思考>空闲），离线整卡隐藏
- 关联：`src/shared/types/kimi.ts`、`src/main/{kimi-monitor,kimi-monitor.test,server,main}.ts`、`src/shared/types/websocket.ts`、`src/renderer/src/{components/KimiCard.vue,App.vue,types/messages.ts,styles/main.css}`

## [android-usage-tab-redesign](plans/android-usage-tab-redesign.md) | [history](history/android-usage-tab-redesign.md)
- 时间：2026-08-25
- 范围：安卓端用量页 UI 改版：双列网格/单列详情切换（SharedPreferences 持久化）、DeepSeek 余额放大（渐变 tile / 全宽余额条）、同心多环网格卡、节奏徽章化
- 关联：`android-app/.../ui/components/{UsageBar,PaceBadge,ConcentricRings,GridProviderCard,DeepseekBalance,ProviderCard}.kt`、`android-app/.../ui/home/UsageTab.kt`

## [top-edge-dock](plans/top-edge-dock.md) | [history](history/top-edge-dock.md)
- 时间：2026-08-25
- 范围：主面板顶部吸附自动隐藏：拖到屏幕顶部松手收起、鼠标划到顶部触发带滑出、重启恢复收起态
- 关联：`src/main/{edge-dock,main,config,preload}.ts`、`src/shared/types/{config,ipc}.ts`、`src/renderer/src/{App.vue,styles/main.css}`、`src/main/edge-dock.test.ts`

## [kimi-coding-api-key](plans/kimi-coding-api-key.md) | [history](history/kimi-coding-api-key.md)
- 时间：2026-08-25
- 范围：Kimi 用量改开放平台 API Key + `coding/v1/usages`(GET)，移除网页登录窗口；两端 UI 从三行精简为两行
- 关联：`src/main/{usage-monitor,main,preload}.ts`、`src/shared/types/{usage,ipc}.ts`、`src/renderer/src/{Settings.vue,components/UsageCard.vue}`、`android-app/.../{data/remote/KimiApi.kt,domain/model/UsageData.kt,ui/home/UsageTab.kt,data/notification/NotificationHelper.kt}`

## [usage-pace-indicator](plans/usage-pace-indicator.md) | [history](history/usage-pace-indicator.md)
- 时间：2026-07-22
- 范围：主界面 UsageCard 为 5h / 周限额模型增加"消耗节奏"提示（快/慢/平均），基于重置时间计算期望平均消耗
- 关联：`src/renderer/src/{utils/usage,composables/useUsageState,components/UsageCard,styles/main.css}`、`package.json`

## [tray-hover-above-icon](plans/tray-hover-above-icon.md) | [history](history/tray-hover-above-icon.md)
- 时间：2026-07-21
- 范围：托盘 hover 弹窗定位改为图标正上方、水平居中于图标、底部贴任务栏（含任务栏在顶/左/右的适配）
- 关联：`src/main/main.ts`

## [tray-hover-usage-popup](plans/tray-hover-usage-popup.md) | [history](history/tray-hover-usage-popup.md)
- 时间：2026-07-21
- 范围：鼠标 hover 托盘图标时弹出"简易用量"悬浮层（4 provider mini bar + DeepSeek 余额 + 最后更新时间），离开后自动关闭
- 关联：`src/main/{main,preload}.ts`、`src/shared/types/ipc.ts`、`src/renderer/src/{TrayHover.vue,tray-hover.html,tray-hover.ts,styles/tray-hover.css,composables/useUsageState.ts}`、`vite.config.ts`

## [auto-provider-auth](plans/auto-provider-auth.md) | [history](history/auto-provider-auth.md)
- 时间：2026-07-20
- 范围：Kimi 改内嵌登录窗口抓 token、Copilot 改 Device Flow OAuth、新增 DeepSeek（余额）与 Codex（读 ~/.codex/auth.json）provider
- 关联：`src/main/{kimi-login,copilot-auth,codex-credentials,usage-monitor,main,config,server,preload}.ts`、`src/shared/types/{usage,config,ipc}.ts`、`src/renderer/src/{Settings.vue,components/UsageCard.vue,FloatingBall.vue,App.vue,composables/useUsageState.ts,types/messages.ts}`
## [android-theme-switching](plans/android-theme-switching.md) | [history](history/android-theme-switching.md)
- 时间：2026-06-28
- 范围：Android App 新增浅色/深色/跟随系统主题切换，并在设置页提供 SegmentedButton 选择器
- 关联：`android-app/app/src/main/java/com/aisignallight/ui/theme/Theme.kt`、`android-app/app/src/main/java/com/aisignallight/MainActivity.kt`、`android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsScreen.kt`

## [android-launcher-icon-dark-mode](plans/android-launcher-icon-dark-mode.md) | [history](history/android-launcher-icon-dark-mode.md)
- 时间：2026-06-28
- 范围：Android 启动图标背景从亮紫色改为深蓝灰，适配暗色模式
- 关联：`android-app/app/src/main/res/drawable/ic_launcher_background.xml`、`android-app/app/src/main/res/values/colors.xml`

## [qr-lan-fetch-config](plans/qr-lan-fetch-config.md) | [history](history/qr-lan-fetch-config.md)
- 时间：2026-06-23
- 范围：修复 QR 容量超限；QR 只携带 host/port/apiKey，手机端扫码后走 WS 反向拉取精简 `MobileAppConfig`
- 关联：`src/shared/types/{config,websocket}.ts`、`src/main/{pairing,server}.ts`、`android-app/.../{domain/model,data/remote,data/local,ui/scan}/*`

## [floating-ball-dismiss-indicator](plans/floating-ball-dismiss-indicator.md) | [history](history/floating-ball-dismiss-indicator.md)
- 时间：2026-06-24
- 范围：悬浮球顶部通知指示灯亮起时支持点击灭灯，复用 notifyCleared IPC 通道清空所有 pending cwd
- 关联：`src/renderer/src/FloatingBall.vue`、`src/renderer/src/styles/floating-ball.css`

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

