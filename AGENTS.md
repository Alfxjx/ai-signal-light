# AGENTS.md

This file provides guidance to coding agents (Codex, Kimi Code, etc.) when working with code in this repository.

## Project Overview

`ai-assistant-status-monitor` (产品名: **AI状态监控**) is an Electron desktop app that monitors **Claude Code project activity** (time since last assistant response, per project) and **AI usage quotas** (Kimi / MiniMax / GitHub Copilot / DeepSeek / Codex / 火山引擎 / MiMo). It shows a small always-on-top, frameless, transparent main panel plus an optional floating status ball and an optional desktop pet window, with system tray support. Live updates flow over an embedded HTTP + WebSocket server.

The repository also contains these sibling projects:

- `android-app/` — standalone native Android app (**AI 用量监控**): Kotlin + Jetpack Compose + Hilt. It does **not** talk to the desktop — it calls each provider's usage API directly (Kimi / MiniMax / GitHub Copilot / DeepSeek / 火山引擎 / MiMo), stores config locally in encrypted prefs, and ships a Glance home-screen widget.
- `landing/` — marketing landing page, deployed to GitHub Pages.
- `opencode-plugin/` — 用量侧边栏插件，供 **opencode** 在自己的侧边栏里显示各家用量。独立 npm 包，**只读**桌面端的 `config.json`（固定读正式版，不读 dev 版），不含任何写入逻辑。
- `opencode-usage-plugin-helper-cli/` — 上述插件的配置助手 CLI（`init` / `set` / `doctor` / `install`），让没装桌面程序的 opencode 用户能自助配置。独立 npm 包，原子写且只动自己管的键。

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | One-time setup |
| Build main process | `npm run build:main` | `tsc -p tsconfig.main.json` → `dist/main/` (+ `dist/types/`). **Required once before `npm run dev`** — dev does not rebuild main |
| Dev mode | `npm run dev` | Vite dev server (5173) + Electron main with `--dev` flag |
| Production run | `npm start` | Builds main + renderer, then `electron dist/main/main.js` |
| Type check | `npm run typecheck` | `vue-tsc` (renderer) + `tsc` (main) |
| Run tests | `npm test` | Vitest, `src/**/*.test.ts`, node environment |
| Package for distribution | `npm run build` | tsc + vite build + electron-builder → `dist/` (win `portable`, mac `dmg`, linux `AppImage`) |
| 预览发布 | `npm run release:dry-run` | 只读，输出版本号和 changelog 预览 |
| 正式发布 | `npm run release` | `commit-and-tag-version`: 自动 bump、生成 CHANGELOG、打 tag |
| Landing dev/build | `npm run landing:dev` / `landing:build` | Runs the corresponding script in `landing/` |
| opencode 插件 / CLI 测试 | `cd opencode-plugin && npm test`、`cd opencode-usage-plugin-helper-cli && npm test` | 两个都是独立 npm 包，需各自 `npm install`；根目录 `npm test` 不覆盖 |
| Android build | `cd android-app && ./gradlew assembleDebug` | Gradle wrapper (`gradlew.bat` on Windows)。产物 `app/build/outputs/apk/debug/app-debug.apk`（debug 签名可直装；release 未配签名，无法安装） |
| Android 版本号 | 改 `android-app/app/build.gradle.kts` 的 `versionName` | `versionCode` 自动取 `git rev-list --count HEAD`，每次提交打包都会递增；**发版打包前手动 bump `versionName`** |

## Architecture

The desktop app uses **Vue 3 + Vite + TypeScript** for the renderer and **Node/Electron (CommonJS)** for the main process. The main process embeds an HTTP + WebSocket server (`src/main/server.ts`, port **3456**) that also serves the renderer statically in production; in dev the renderer is served by Vite on 5173. There is no IPC traffic for status data — everything goes over WebSocket.

```
src/
├── main/                      # Electron main process (tsc → dist/main)
│   ├── main.ts                # Bootstrap: main/settings/floating-ball/QR windows, tray, IPC,
│   │                          # Claude hooks install/uninstall into ~/.claude/settings.json
│   ├── preload.ts             # contextBridge: exposes electronAPI (nodeIntegration off, contextIsolation on)
│   ├── server.ts              # StatusServer: HTTP static + REST (/api/status, /api/hooks/claude) + WS push,
│   │                          # maintains pendingByCwd from Claude hooks, getConfig handler for mobile
│   ├── detector.ts            # Scans ~/.claude/projects/**/*.jsonl every 30s for last assistant timestamp
│   ├── kimi-monitor.ts        # Kimi Code (web) 实时状态：连本机 kimi web 服务（REST+WS），会话忙态按 cwd 归并
│   ├── usage-monitor.ts       # Polls Kimi / MiniMax / Copilot / DeepSeek / Codex / 火山引擎 / MiMo quota APIs on configured interval
│   ├── volcengine-sign.ts     # 火山引擎 OpenAPI V4 签名（纯函数，node:crypto），供 usage-monitor 的 AK/SK 通道调用
│   ├── copilot-auth.ts        # GitHub Device Flow OAuth + copilot_internal session token + quota mapping
│   ├── codex-credentials.ts   # Reads/refreshes ~/.codex/auth.json (OpenAI OAuth) for wham/usage API
│   ├── config.ts              # ConfigStore: userData/config.json with atomic writes; VALID_INTERVALS, HOOK_EVENTS
│   ├── pairing.ts             # QR payload (v/host/port/apiKey) + LAN IP detection + MobileAppConfig projection
│   ├── edge-dock.ts           # TopEdgeDock: 主面板顶部吸附/收起/滑出状态机（依赖注入，不 import electron）
│   ├── pet-store.ts           # 桌面宠物素材库：userData/pets/<id>.json（含 base64 图集）磁盘原子写
│   ├── edge-dock.test.ts      # Vitest, colocated
│   ├── usage-monitor.test.ts  # Vitest, colocated
│   ├── pet-store.test.ts      # Vitest, colocated
│   └── kimi-monitor.test.ts   # Vitest, colocated（mapPhase/aggregateState/buildProjects/reconcile 纯函数）
├── renderer/src/              # Vue 3 + TS (vite build → dist/renderer)
│   ├── main.ts / App.vue                  # Main panel entry + root
│   ├── settings.ts / Settings.vue         # Settings window entry + root
│   ├── floating-ball.ts / FloatingBall.vue  # 悬浮球入口：拟物像素 LED，显示 Kimi 聚合状态；短按弹下拉
│   ├── dropdown.ts / Dropdown.vue           # 悬浮球下拉窗口：最近活跃项目 + Kimi 5h 用量
│   ├── pet.ts / pet.html / PetView.vue     # 桌面宠物窗口：Codex 图集播放 + 三态交互（单击开 Kimi Web/长按弹下拉/右键菜单）
│   ├── pet/pet-install.ts (+ .test.ts)     # 画廊命令解析 + 安全 unzip + 图集尺寸校验（仅下载素材）
│   ├── pet/pet-sprites.ts                  # 官方 Codex 图集逐帧播放器（9 行动作表，CSS background-position）
│   ├── components/            # TitleBar, ClaudeCard (project list), KimiCard (web 状态), UsageCard (quota bars)
│   ├── composables/           # useWebSocket (reconnect), useUsageState
│   ├── utils/                 # time.ts, cwd.ts, kimiFilter.ts (+ colocated *.test.ts)
│   └── styles/
├── shared/                    # Imported by both main and renderer
│   ├── constants.ts           # WS_PORT = 3456 (single source of truth)
│   ├── types/                 # websocket / config / ipc / usage / detector / kimi types
│   └── utils/cwd.ts           # normalizeCwd — Windows case-insensitive path handling
scripts/
└── copy-renderer-assets.js    # Copies PNG icons into dist/renderer after vite build

android-app/                   # Native Android app (namespace com.aisignallight, minSdk 26) — 独立运行，无扫码/无桌面同步
└── app/src/main/java/com/aisignallight/
    ├── data/
    │   ├── remote/            # 五个平台用量 API（Kimi/MiniMax/Copilot/DeepSeek/火山引擎）+ KtorClientProvider（HTTP client + 可选代理）
    │   │                      # VolcengineSign.kt = 与桌面 volcengine-sign.ts 同一套 V4 签名（官方测试向量在 src/test 下），无新依赖
    │   ├── local/             # SecureConfigStore（EncryptedSharedPreferences → AppConfig）、
    │   │                      # UsageSnapshotStore（DataStore 存用量快照 JSON，供小组件与冷启动读取）；无 Room
    │   ├── repository/        # UsageRepositoryImpl（并发拉五家 + 成功后落盘快照）
    │   └── notification/      # NotificationHelper（warn/danger 阈值通知）
    ├── domain/                # model（AppConfig / @Serializable 用量模型）、repository 接口、utils（pace/percent）
    ├── ui/                    # Compose: home（单屏用量列表 + Material3 PullToRefreshBox 下拉刷新）,
    │                          # settings（分组 ListItem + AlertDialog 即时保存；火山用专用 VolcengineConfigDialog 填 AK/SK）, components（ProviderCard/UsageBar/PaceBadge/DeepseekBalance）, theme
    ├── widget/                # Glance 桌面小组件：UsageWidget + UsageWidgetReceiver（读 UsageSnapshotStore + SecureConfigStore，
    │                          # 整件点击打开 MainActivity；无已配置服务商时提示去设置）
    ├── worker/                # UsagePollingWorker：按 intervalMinutes 周期轮询 + 阈值通知 + 刷新小组件
    └── di/                    # Hilt modules（DataModule 只绑 Config/Usage repository）

android-app/app/src/main/res/xml/usage_widget_info.xml   # 小组件元数据（minWidth 250dp × minHeight 110dp，updatePeriodMillis=0）

landing/                       # Vue 3 + Tailwind landing page (own package.json)
                               # Auto-deploys to GitHub Pages on push to main (`.github/workflows/deploy-landing.yml`)

opencode-plugin/               # opencode 供应商用量侧边栏插件（own package.json + vitest，TypeScript TUI）
    src/
    ├── config.ts              # 只读解析桌面端正式版 config.json（configPath 固定，不读 dev 版）
    ├── providers/             # kimi / minimax / copilot / deepseek / mimo / volcengine 六家取数与响应映射
    │                          # 含 volcengine-sign.ts（与桌面端 src/main/volcengine-sign.ts 同一套 V4 签名）
    ├── layout.ts              # yoga 布局：宽度对齐 / 条形 / 倒计时 / 金额
    ├── format.ts              # 百分比、倒计时、货币格式化
    └── tui.tsx                # 侧边栏渲染（表头刷新全部 + 每家单刷按钮，点刷新不折叠）

opencode-usage-plugin-helper-cli/   # 插件配置助手 CLI（own package.json + vitest，零第三方运行时依赖）
    src/
    ├── index.ts               # init / set / doctor / install 四个子命令
    ├── config-io.ts           # 原子写 config.json，且只动自己管的键
    └── paths.ts / providers.ts / prompt.ts / ui.ts
```

> `opencode-plugin/` 与 `opencode-usage-plugin-helper-cli/` 是**独立 npm 包**，各自有 lockfile 与 vitest。
> 根目录 `npm test` 只跑 `src/**/*.test.ts`，**不覆盖**这两个目录；改它们要用各自目录的 `npm test`。

## State Model

- **Claude Code status**: time since last `type=assistant` (non-sidechain) record in `~/.claude/projects/**/*.jsonl`. Detector reads the file tail (8KB) backwards. Rendered with age-based colors: `<5min` green, `<1h` yellow, older gray. Project display name priority: `cwd` last segment > `slug` > project dir id.
- **Kimi Code (web) 状态 (`kimi-monitor.ts`)**: 连本机 `kimi web` 服务读实时状态——token 读 `~/.kimi-code/server.token`，端口读 `~/.kimi-code/server/instances/*.json` 自报 port（兜底 58627 起探 100 个端口）；WS `/api/v1/ws`（`Sec-WebSocket-Protocol: kimi-code.bearer.<token>` 鉴权、`ping` 回 `pong`）+ 每 3s REST `/api/v1/sessions` 校准。会话忙态按 `metadata.cwd` 归并成目录行，头部聚合四态：待审核 > 编辑中 > 思考中 > 空闲（离线）。列表裁剪分两套：主面板 `KimiCard` 只显示**当日**（`kimiFilter.filterTodayProjects`，本地自然日）活动过的目录，悬浮球下拉保留 3 天窗口（`filterRecentProjects`）；两者都强留「非空闲 / pending」的行，保证正在干活的会话不被时间戳藏起来。Kimi 用量走的是 **实验性 API**，字段随版本可能变化。状态经 `StatusServer` 以 `kimiStatus` 消息推 WS 送，卡片在服务不可达时隐藏。`parseNotifyCall` 从 WS `tool.call.started` / `tool.result`（`tool_name='NotifyUser'`，实验性字段多形状兜底）捕获消息进 `KimiStatus.notify`，悬浮球 LED 右侧弹气泡 15s 自动隐藏（窗口经 `floating-ball:set-width` 动态加宽）。注意与底下的 **Kimi 用量配额** 是两回事。
- **Pending notifications (red dot)**: Claude Code hooks (`Notification` / `Stop` / `PreToolUse`) are installed as `~/.ai-status-monitor/claude-hook.js` + entries in `~/.claude/settings.json`; the hook POSTs to `http://127.0.0.1:3456/api/hooks/claude`. `StatusServer` keeps a `pendingByCwd` map and broadcasts `pendingChanged` over WS. The renderer clears a pending entry when the user clicks the project or a newer assistant response arrives.
- **Usage quotas**: `UsageMonitor` polls provider APIs every `intervalMinutes` (5/10/15/30/60), pushes `usageInit` / `usageUpdate` over WS. Progress bar width and label percent both represent **used %** for all providers (bar wider = closer to limit); warn/danger thresholds are configurable in settings. Auth per provider: **Kimi** — manual openplatform API key, queries `GET https://api.kimi.com/coding/v1/usages` (7d + 5h windows, `codingWeekly` / `codingFiveHour`); **MiniMax** — manual openplatform API key; **Copilot** — GitHub Device Flow OAuth (`copilot-auth.ts`, `gho_` token in `copilot.token`; legacy cookie paste still works, distinguished by prefix); **DeepSeek** — manual platform API key (balance only, no rate windows); **Codex** — auto-reads `~/.codex/auth.json`, refreshes via auth.openai.com when expired (`codex-credentials.ts`); **火山引擎 (Ark Coding Plan)** — 官方 OpenAPI + V4 签名（`volcengine-sign.ts`，`GET https://open.volcengineapi.com/?Action=GetCodingPlanUsage`，host `open.volcengineapi.com` / region `cn-beijing` / service `ark`），AK/SK 长期有效；**Cookie / x-csrf-token 通道已移除**；AK/SK 不下发手机（`MobileAppConfig` 与二维码均不含火山凭证，安卓需手动填写）；**MiMo (小米)** — 手动粘贴 platform.xiaomimimo.com 控制台整段 Cookie（`GET /api/v1/balance`，余额型，`sk-` API Key 查不到余额），桌面与安卓两端共用同一套余额卡。`UsageMonitor._safeRun` accepts an optional `resolveToken` for auto credential sources (currently only Codex).
- **QR pairing（已无安卓消费端）**: 桌面端仍在 `src/main/pairing.ts` 生成 `{v, host, port, apiKey}` 二维码，`StatusServer` 的 `getConfig` 处理器也仍在，但**安卓 APP 已不再扫码/不再连桌面 WS**（2026-10 起改为纯本地用量监控，见 `.vibe-harness/history/android-usage-only-redesign.md`）。改动桌面配对逻辑前先确认是否还有消费方。
- **顶部吸附收起 (`edge-dock.ts`)**: 主面板拖到屏幕顶部松手（顶边距 workArea 顶边 ≤ 10px）即吸附，延迟后动画收起到 `workArea.y - height + 5`，屏内只剩面板**底边** 5px；主进程每 120ms 轮询 `screen.getCursorScreenPoint()`，光标进顶部触发带则滑出，离开且窗口不"忙"（面板未聚焦、设置/QR 窗口未开）则重新收起；从展开态拖离顶部即退出吸附。状态存 `config.window.dockedTop`，通过 `WINDOW_DOCK_STATE` 通道推给渲染层画底边把手（`.app--docked`）。吸附态下窗口 bounds 由 dock 托管，`saveBounds` 必须保留 config 里旧的 x/y，不能写入收起态的负 y。
- **桌面宠物 (`pet-*`)**: 与悬浮球**独立开关、可共存**（`config.pet.enabled`）。素材从画廊粘贴命令导入（`pet-install.ts`：awesome-codex-pet slug / codex-pets.net zip / petdex.dev，只下载 `pet.json`+`spritesheet.webp`，`Image` 校验图集 1536 宽 × 208 整数倍高 ≥9 行），主进程 `pet-store.ts` 存 `userData/pets/`。宠物窗口透明置顶 `focusable:false`，尺寸 `192×scale/100 × 208×scale/100`，`pet-sprites.ts` 按官方 9 行动作表逐帧播放，跟随 Kimi 聚合状态（thinking/editing→running、approval→waiting、idle→idle、offline→failed 灰显）。交互：单击 → `KimiMonitor.getWebUrl()` 的 `http://127.0.0.1:<port>` 走 `shell.openExternal`（浏览器对相同 URL 自动聚焦已有标签，不重复开；服务不可达弹系统通知）；左键长按 600ms → 弹共用下拉（锚定宠物窗口）；右键 → 原生菜单（打开 Kimi Web / 打开设置 / 隐藏宠物）；拖拽移动位置存 `config.pet.x/y`。宠物变化经 `pet:changed` 事件通知窗口重建。

## Conventions

- Comments and UI strings are in Simplified Chinese — keep new user-facing copy consistent.
- `WS_PORT` in `src/shared/constants.ts` is the single source of truth for the embedded server port.
- `normalizeCwd` in `src/shared/utils/cwd.ts` is used by both main process and renderer to handle Windows case-insensitive paths consistently.
- Static file serving in `server.ts` guards against path traversal via `path.join(STATIC_ROOT, url)` + `startsWith(STATIC_ROOT)` — preserve this when adding routes.
- WebSocket reconnection in `useWebSocket.ts` uses exponential backoff capped at 30s.
- Dev vs packaged config is isolated via `app.setName('AI状态监控-dev')` in dev mode (separate userData dirs).
- Tests are Vitest, colocated with sources as `*.test.ts` (`src/main/`, `src/renderer/src/utils/`). Run with `npm test`.
- The floating ball window is intentionally `focusable: false` so it does not steal focus from the IDE when clicked. It renders a single pixel-art skeuomorphic LED reflecting the **Kimi Code aggregate state** (`approval`=红闪 / `editing`=黄常亮 / `thinking`=黄呼吸 / `idle`=绿微光 / `offline`=灰灭); short-press toggles a sibling **dropdown** window anchored below it (focusable, hidden on blur/Esc), which lists recent active projects (`kimiFilter.filterRecentProjects`: keep busy or active within 3 days) plus the Kimi 5h usage bar.
- The deprecated `Status` enum (IDLE/EXECUTING/WAITING) still exists in some type casts for historical compatibility; new code should not rely on it.

## Harness Conventions

### 共识记忆
- 共识记忆目录：`.vibe-harness/`
  - `plans/` — 实施计划
  - `history/` — 实际改动记录
  - `index.md` — 任务索引（新 session 第一步先读它定位相关历史）

### Session 纪律
- **一个任务一个 session**：禁止把多个任务塞进同一个对话
- **上下文隔离**：每个任务从干净上下文开始，靠 `.vibe-harness/` 跨 session 传递信息

### Coding 流程
1. 任务开始 → 读相关 `history/`（了解已有约束）
2. 实施计划写入 `.vibe-harness/plans/<task-name>.md`
3. 实施编码
4. 完成后 → 改动摘要 + 影响范围 写入 `.vibe-harness/history/<task-name>.md`
5. 更新 `index.md`

### 文件命名
- `<task-name>.md`，语义化 kebab-case（如 `fix-login-redirect`）
- **禁用** 日期、随机字符、任务序号

### 发版交付流程（用户约定的固定动作）
功能做完、验证通过后，**默认按下面顺序执行，不需要再确认**：
1. **记录**：更新本 `AGENTS.md`（新功能/新约定）与 `.vibe-harness/history/<task-name>.md`，并在 `index.md` 追加索引
2. **提交**：`git commit`（Conventional Commits，中文标题；构建/版本类改动与功能改动分开提交）
3. **推送**：`git push`（当前分支 `main` → `origin/main`）
4. **给下载链接**（仅涉及安卓包时）：
   ```bash
   cd android-app && ./gradlew assembleDebug          # 产物 app/build/outputs/apk/debug/app-debug.apk
   mkdir -p /tmp/apk-serve && cp app/build/outputs/apk/debug/app-debug.apk /tmp/apk-serve/<名字>-<versionName>.apk
   cd /tmp/apk-serve && python3 -m http.server 8899 --bind 0.0.0.0   # 后台任务方式启动
   ipconfig getifaddr en0                             # 取局域网 IP，拼出 http://<IP>:8899/<文件名>
   ```
   手机与电脑需同一网段；首次安装要允许"未知来源"。**用户说下载完就停掉服务并 `rm -rf /tmp/apk-serve`**（不要让它长驻）。
- 安卓 `versionCode` 自动取 git 提交数，所以**提交后**再打包，build number 才包含本次改动
