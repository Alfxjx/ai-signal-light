# AGENTS.md

This file provides guidance to coding agents (Codex, Kimi Code, etc.) when working with code in this repository.

## Project Overview

`ai-assistant-status-monitor` (产品名: **AI状态监控**) is an Electron desktop app that monitors **Claude Code project activity** (time since last assistant response, per project) and **AI usage quotas** (Kimi / MiniMax / GitHub Copilot / DeepSeek / Codex). It shows a small always-on-top, frameless, transparent main panel plus an optional floating status ball, with system tray support. Live updates flow over an embedded HTTP + WebSocket server.

The repository also contains two sibling projects:

- `android-app/` — native Android companion app. Pairs with the desktop via QR code and syncs project/usage state over LAN WebSocket.
- `landing/` — marketing landing page, deployed to GitHub Pages.

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
| Android build | `cd android-app && ./gradlew assembleDebug` | Gradle wrapper (`gradlew.bat` on Windows) |

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
│   ├── usage-monitor.ts       # Polls Kimi / MiniMax / Copilot / DeepSeek / Codex quota APIs on configured interval
│   ├── copilot-auth.ts        # GitHub Device Flow OAuth + copilot_internal session token + quota mapping
│   ├── codex-credentials.ts   # Reads/refreshes ~/.codex/auth.json (OpenAI OAuth) for wham/usage API
│   ├── config.ts              # ConfigStore: userData/config.json with atomic writes; VALID_INTERVALS, HOOK_EVENTS
│   ├── pairing.ts             # QR payload (v/host/port/apiKey) + LAN IP detection + MobileAppConfig projection
│   └── usage-monitor.test.ts  # Vitest, colocated
├── renderer/src/              # Vue 3 + TS (vite build → dist/renderer)
│   ├── main.ts / App.vue                  # Main panel entry + root
│   ├── settings.ts / Settings.vue         # Settings window entry + root
│   ├── floating-ball.ts / FloatingBall.vue  # Floating status ball entry + root
│   ├── components/            # TitleBar, ClaudeCard (project list), UsageCard (quota bars)
│   ├── composables/           # useWebSocket (reconnect), useUsageState
│   ├── utils/                 # time.ts, cwd.ts (+ colocated *.test.ts)
│   └── styles/
├── shared/                    # Imported by both main and renderer
│   ├── constants.ts           # WS_PORT = 3456 (single source of truth)
│   ├── types/                 # websocket / config / ipc / usage / detector types
│   └── utils/cwd.ts           # normalizeCwd — Windows case-insensitive path handling
scripts/
└── copy-renderer-assets.js    # Copies PNG icons into dist/renderer after vite build

android-app/                   # Native Android app (namespace com.aisignallight, minSdk 26)
└── app/src/main/java/com/aisignallight/
    ├── data/                  # remote (Ktor APIs, DesktopSyncClient WS), local (Room, SecureConfigStore), notification
    ├── domain/                # models, repository interfaces, utils
    ├── ui/                    # Compose screens: home (Usage/Claude tabs), scan (CameraX + ML Kit QR), settings
    └── di/                    # Hilt modules

landing/                       # Vue 3 + Tailwind landing page (own package.json)
                               # Auto-deploys to GitHub Pages on push to main (`.github/workflows/deploy-landing.yml`)
```

## State Model

- **Claude Code status**: time since last `type=assistant` (non-sidechain) record in `~/.claude/projects/**/*.jsonl`. Detector reads the file tail (8KB) backwards. Rendered with age-based colors: `<5min` green, `<1h` yellow, older gray. Project display name priority: `cwd` last segment > `slug` > project dir id.
- **Pending notifications (red dot)**: Claude Code hooks (`Notification` / `Stop` / `PreToolUse`) are installed as `~/.ai-status-monitor/claude-hook.js` + entries in `~/.claude/settings.json`; the hook POSTs to `http://127.0.0.1:3456/api/hooks/claude`. `StatusServer` keeps a `pendingByCwd` map and broadcasts `pendingChanged` over WS. The renderer clears a pending entry when the user clicks the project or a newer assistant response arrives.
- **Usage quotas**: `UsageMonitor` polls provider APIs every `intervalMinutes` (5/10/15/30/60), pushes `usageInit` / `usageUpdate` over WS. Progress bar width and label percent both represent **used %** for all providers (bar wider = closer to limit); warn/danger thresholds are configurable in settings. Auth per provider: **Kimi** — manual openplatform API key, queries `GET https://api.kimi.com/coding/v1/usages` (7d + 5h windows, `codingWeekly` / `codingFiveHour`); **MiniMax** — manual openplatform API key; **Copilot** — GitHub Device Flow OAuth (`copilot-auth.ts`, `gho_` token in `copilot.token`; legacy cookie paste still works, distinguished by prefix); **DeepSeek** — manual platform API key (balance only, no rate windows); **Codex** — auto-reads `~/.codex/auth.json`, refreshes via auth.openai.com when expired (`codex-credentials.ts`). `UsageMonitor._safeRun` accepts an optional `resolveToken` for auto credential sources (currently only Codex).
- **QR pairing (Android)**: desktop shows a QR containing only `{v, host, port, apiKey}` (`src/main/pairing.ts`); the Android app scans it, connects to the WS server with the apiKey, and pulls a trimmed `MobileAppConfig` via the server's `getConfig` handler, then keeps syncing over LAN WebSocket.

## Conventions

- Comments and UI strings are in Simplified Chinese — keep new user-facing copy consistent.
- `WS_PORT` in `src/shared/constants.ts` is the single source of truth for the embedded server port.
- `normalizeCwd` in `src/shared/utils/cwd.ts` is used by both main process and renderer to handle Windows case-insensitive paths consistently.
- Static file serving in `server.ts` guards against path traversal via `path.join(STATIC_ROOT, url)` + `startsWith(STATIC_ROOT)` — preserve this when adding routes.
- WebSocket reconnection in `useWebSocket.ts` uses exponential backoff capped at 30s.
- Dev vs packaged config is isolated via `app.setName('AI状态监控-dev')` in dev mode (separate userData dirs).
- Tests are Vitest, colocated with sources as `*.test.ts` (`src/main/`, `src/renderer/src/utils/`). Run with `npm test`.
- The floating ball window is intentionally `focusable: false` so it does not steal focus from the IDE when clicked.
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
