# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Harness Conventions

### 共识记忆
- 共识记忆目录：`.vibe-harness/`
  - `plans/` — 实施计划
  - `history/` — 实际改动记录
  - `README.md` — 目录使用说明
  - `index.md` — 任务索引

### Session 纪律
- **一个任务一个 session**：禁止把多个任务塞进同一个对话
- **新 session 第一步**：阅读 `.vibe-harness/index.md` 定位相关历史，避免破坏已有功能
- **上下文隔离**：每个任务从干净上下文开始，靠 `.vibe-harness/` 跨 session 传递信息

### Coding 流程
1. 任务开始 → 读相关 `history/`（了解已有约束）
2. `/plan` → 实施计划写入 `.vibe-harness/plans/<task-name>.md`
3. 实施编码
4. 完成后 → 改动摘要 + 影响范围 写入 `.vibe-harness/history/<task-name>.md`
5. 更新 `index.md`

### 文件命名
- `<task-name>.md`，语义化 kebab-case（如 `fix-login-redirect`）
- **禁用** 日期、随机字符、任务序号

### 换模型 / 升级
- 历史完整 → 换更强模型后可针对性重构、强对比优劣
- 这是 harness 的正向闭环收益之一

## Project Overview

`ai-assistant-status-monitor` (产品名: **AI状态监控**) is an Electron desktop app that monitors Claude Code project activity and AI model usage quotas (Kimi, MiniMax, Copilot). It shows a small always-on-top main panel and an optional floating status bar, using WebSocket push for live updates.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | One-time setup |
| Dev mode | `npm run dev` | Vite dev server (5173) + Electron main (`--dev`) |
| Production run | `npm start` | Build main/renderer then run `electron dist/main/main.js` |
| Package for distribution | `npm run build` | `tsc` + `vite build` + `electron-builder` → `dist/` |
| Type check | `npm run typecheck` | `vue-tsc` + `tsc` for renderer and main |
| Run tests | `npm test` | Vitest |

## Architecture

The app uses **Vue 3 + Vite + TypeScript** for the renderer and **Node/Electron** for the main process. The main process embeds an HTTP + WebSocket server that the renderer connects to.

```
src/
├── main/
│   ├── main.ts            # Electron bootstrap: main/settings/floating windows, tray, IPC
│   ├── preload.ts         # contextBridge: exposes electronAPI to renderer
│   ├── server.ts          # StatusServer: HTTP static + WS push, pendingByCwd sync
│   ├── usage-monitor.ts   # Polls Kimi/MiniMax/Copilot APIs
│   ├── config.ts          # Config persistence with atomic writes
│   └── detector.ts        # Scans ~/.claude/projects/ for assistant timestamps
├── renderer/src/
│   ├── App.vue            # Main panel root
│   ├── Settings.vue       # Settings window
│   ├── FloatingBall.vue   # Floating status bar window
│   ├── components/        # UsageCard, ClaudeCard, TitleBar
│   ├── composables/       # useWebSocket, useUsageState
│   ├── utils/             # time formatting, cwd normalization
│   └── styles/            # Component styles
├── shared/
│   ├── types/             # IPC, WebSocket, usage types
│   ├── constants.ts       # WS_PORT (single source of truth)
│   └── utils/cwd.ts       # Cross-process cwd normalization
└── scripts/
    └── copy-renderer-assets.js  # Copies PNGs into dist/renderer/
```

## State Model

- **Claude Code status**: time since last `type=assistant` response in jsonl logs. Rendered with age-based colors (`<5min` green / `<1h` yellow / older gray).
- **Pending notifications**: `StatusServer` maintains `pendingByCwd` from Claude hooks; broadcasts `pendingChanged` to all WS clients. The main window consumes pending by clicking a project or receiving a newer response; it notifies the main process via IPC, which clears the pending entry and re-broadcasts.
- **Usage quotas**: `UsageMonitor` polls provider APIs every `intervalMinutes`; pushes `usageInit` / `usageUpdate` over WS. Progress bar fill width and label percent both represent **used %** across all providers (bar wider = closer to limit).

## Conventions

- UI strings and comments are in Simplified Chinese — keep new user-facing copy consistent.
- `WS_PORT` in `src/shared/constants.ts` is the single source of truth for the embedded server port.
- `normalizeCwd` in `src/shared/utils/cwd.ts` is used by both main process and renderer to handle Windows case-insensitive paths consistently.
- Static file serving in `server.ts` guards against path traversal via `path.join(STATIC_ROOT, url)` + `startsWith(STATIC_ROOT)`.
- WebSocket reconnection in `useWebSocket.ts` uses exponential backoff capped at 30s.
- Dev vs packaged config is isolated via `app.setName('AI状态监控-dev')` in dev mode.

## Notes

- The deprecated `Status` enum (IDLE/EXECUTING/WAITING) still exists in some type casts for historical compatibility; new code should not rely on it.
- The floating bar is intentionally `focusable: false` so it does not steal focus from the IDE when clicked.
