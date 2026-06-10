# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`ai-assistant-status-monitor` (产品名: **AI状态监控**) is a lightweight Electron desktop app that shows for each Claude Code project how long it has been since the AI last responded, via a small always-on-top, frameless panel. It uses WebSocket push (30s scanning fallback) for live updates. Kimi Code CLI support is currently disabled.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | One-time setup |
| Dev mode (with DevTools) | `npm run dev` | Passes `--dev` flag to main process |
| Production run | `npm start` | `electron .` |
| Package for distribution | `npm run build` | Uses electron-builder → `dist/` (nsis/dmg/AppImage) |
| Run a single script | `node scripts/status-reporter.js --watch` | Cross-platform status reporter (see below) |

There is **no test suite or linter configured** — `npm test` will not work. No JS framework or bundler; the renderer is plain HTML/CSS/JS served directly by the embedded HTTP server.

## Architecture

The app is a single Electron process running an **embedded HTTP + WebSocket server** that also serves the renderer. No IPC traffic — the renderer talks to the server over WebSocket using the page's own origin (loaded from `http://localhost:3456`).

```
src/
├── main.js          # Electron main: BrowserWindow (frameless, alwaysOnTop, transparent),
│                    # Tray menu, lifecycle, IPC handlers (get-status, toggle-always-on-top).
│                    # Boots StatusServer on port 3456 inside app.whenReady().
├── preload.js       # contextBridge: exposes electronAPI (getStatus, toggleAlwaysOnTop, platform).
│                    # nodeIntegration is disabled, contextIsolation is enabled.
├── server.js        # StatusServer: http + ws.Server on same port. Serves /src/renderer/* statically
│                    # (with path-traversal guard), exposes /api/status and /api/status/:id (GET/POST).
│                    # On WS connect, pushes {type:'init', data} then {type:'statusChange'} on changes.
├── detector.js      # AIDetector: scanClaudeProjects() 每 30s 扫 ~/.claude/projects/,
│                    # 对每个项目读所有 jsonl 尾部 8KB 反向扫最近 type=assistant 的 timestamp,
│                    # 原始数据通过 WebSocket 推给前端，前端做过滤与时间格式化。
│                    # 不再做 idle/executing/waiting 状态判断。Kimi 已停用。
└── renderer/
    ├── index.html   # 单 .status-card[data-assistant="claude"] + 24h/7d/30d/全部 select + 项目列表 ul
    ├── style.css    # Frameless/glassmorphism look; 项目行布局 + age-fresh/warn/stale 颜色
    └── app.js       # StatusMonitor class: renderProjects + formatAge + applyAgeColor,
                     # 60s 定时器刷新相对时间，range 切换即时重渲染（不重新拉数据）。

scripts/
├── status-reporter.js   # Cross-platform Node reporter. Modes:
│                        #   --claude-stdin   read JSON from stdin (Claude Code statusLine pipe)
│                        #   --kimi           one-shot Kimi process check
│                        #   --watch          continuous Kimi monitoring every 5s
├── claude-status.sh / .ps1  # Bash / PowerShell equivalents of --claude-stdin mode
└── kimi-status.sh / .ps1    # Bash / PowerShell equivalents of --kimi mode
```

## State Model

Claude Code 项目监控的"状态"= 距上次 assistant 响应的时间差。在前端做颜色染色（`<5min` 绿 / `<1h` 黄 / 其他灰）。

不再使用 `Status` 枚举中的 IDLE/EXECUTING/WAITING；它们保留在代码里仅作历史兼容。

## Detection Strategy

| Assistant | 数据源 | 读策略 | 轮询 |
|---|---|---|---|
| Claude Code CLI | `~/.claude/projects/<project>/*.jsonl`（主+子代理） | 尾部 8KB 反向扫最近 `type=assistant && isSidechain!==true` 的 timestamp | 30s |
| Kimi Code CLI | — | 已停用 | — |

项目显示名优先级：`cwd` 末级 > `slug` > 项目目录名。

## 已废弃：Adding a New AI Assistant

本项目当前只监控 Claude Code，不再支持通用助手添加流程。如需恢复 Kimi 或新增助手，需重新设计状态模型。

## Conventions

- Comments and UI strings are in Simplified Chinese — keep new user-facing copy consistent.
- Renderer is intentionally dependency-free (no React/build step). Keep it that way unless there's strong reason to change.
- HTTP server in `server.js:75` does its own path-traversal check via `path.join(__dirname, 'renderer', url)` + `startsWith` — preserve this when adding new static routes.
- WS port **3456** is hardcoded in both `main.js` (where StatusServer is constructed) and `renderer/app.js` (the `window.location.host` used to build the WS URL). If changing, update both.
- WebSocket reconnection in `app.js:144` uses exponential backoff capped at 30s.
