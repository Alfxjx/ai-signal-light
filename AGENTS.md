# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

`ai-assistant-status-monitor` (产品名: **AI状态监控**) is a lightweight Electron desktop app that displays the real-time working status of AI coding assistants (Codex, Kimi Code CLI) via a small always-on-top, frameless panel with system tray support. It uses WebSocket push (2s polling fallback) for live updates.

## Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | One-time setup |
| Dev mode (with DevTools) | `npm run dev` | Passes `--dev` flag to main process |
| Production run | `npm start` | `electron .` |
| Package for distribution | `npm run build` | Uses electron-builder → `dist/` (nsis/dmg/AppImage) |
| Run a single script | `node scripts/status-reporter.js --watch` | Cross-platform status reporter (see below) |
| 预览发布 | `npm run release:dry-run` | 只读，输出版本号和 changelog 预览 |
| 正式发布 | `npm run release` | 自动 bump、生成 CHANGELOG、打 tag、推送 |

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
├── detector.js      # AIDetector: state machine for each assistant.
│                    # 2s interval → checkAll() → checkClaude() + checkKimi().
│                    # Reads status JSON from ~/.ai-status-monitor/, falls back to process detection.
│                    # Exposes setManualStatus() used by the renderer's manual buttons.
│                    # Also exports StatusFileWriter for external scripts.
└── renderer/
    ├── index.html   # Two .status-card blocks (data-assistant="Codex"/"kimi") with .btn-manual
    │                # buttons (idle/executing/waiting). Adding a new assistant = new card here.
    ├── style.css    # Frameless/glassmorphism look; status colors via .status-idle/.status-executing/.status-waiting
    └── app.js       # StatusMonitor class: WS connect with exponential reconnect, message dispatch,
                     # updateCard() reflects state + syncs manual button .active class.

scripts/
├── status-reporter.js   # Cross-platform Node reporter. Modes:
│                        #   --Codex-stdin   read JSON from stdin (Codex statusLine pipe)
│                        #   --kimi           one-shot Kimi process check
│                        #   --watch          continuous Kimi monitoring every 5s
├── Codex-status.sh / .ps1  # Bash / PowerShell equivalents of --Codex-stdin mode
└── kimi-status.sh / .ps1    # Bash / PowerShell equivalents of --kimi mode
```

## State Model

`Status` enum in `src/detector.js:12-16`:
- `idle` — assistant process not found, or status file says idle
- `executing` — process running with no pending tool calls; or status file has `isGenerating`/`isThinking`/recent `lastActivity` (< 5s); or Kimi with no status file (process-exists heuristic)
- `waiting` — Codex has `pendingToolUses.length > 0`; or Kimi state is `waiting_confirmation`/`pending`

## Detection Strategy Per Assistant

| Assistant | Source 1 (status file) | Source 2 (process) | Manual fallback |
|-----------|----------------------|--------------------|-----------------|
| Codex CLI | `~/.ai-status-monitor/Codex-status.json` written by `statusLine` script | `Codex` / `Codex.exe` process | Buttons in card |
| Codex (VS Code extension) | — (no statusLine) | `Code.exe` / `Code` process; detail shows "VS Code 插件版" hint | **Required** — buttons only |
| Kimi Code CLI | `~/.ai-status-monitor/kimi-status.json` | `kimi`/`kimi.exe`, or Windows fallback: `node.exe` with "kimi" in CommandLine (via `wmic`) | Buttons in card |

Windows npm-global installs of Kimi run as `node.exe`, so `findNodeProcessByArgs` in `src/detector.js:300` uses `wmic process where "name='node.exe'" get ProcessId,CommandLine` to match by command line. A tasklist-based fallback exists at `findNodeProcessByTasklist`.

## Status File Contract (read by detector)

`~/.ai-status-monitor/Codex-status.json`:
```json
{
  "pendingToolUses": [...],   // non-empty → waiting
  "isGenerating": true,        // → executing
  "isThinking": true,          // → executing
  "lastActivity": "ISO-8601",  // < 5s old → executing, else idle
  "model": "...", "workspace": "..."
}
```

`~/.ai-status-monitor/kimi-status.json`:
```json
{ "state": "thinking|generating|waiting_confirmation|pending|idle",
  "running": true, "pid": 1234, "model": "...", "tokensUsed": 0,
  "lastActivity": "ISO-8601" }
```

The directory is auto-created on first run by `StatusFileWriter` / `ensureDir()`.

## Adding a New AI Assistant

Per `README.md:163-190` — three edits:
1. `src/detector.js`: register in `this.assistants` map (constructor), add `async checkXxx()`, call from `checkAll()`.
2. `src/renderer/index.html`: duplicate a `.status-card` block with a new `data-assistant` value and matching `id`s (`xxxStatus`, `xxxDetail`, `xxxManualControls`).
3. Optionally a `scripts/` reporter if the assistant supports statusLine piping.

## Conventions

- Comments and UI strings are in Simplified Chinese — keep new user-facing copy consistent.
- Renderer is intentionally dependency-free (no React/build step). Keep it that way unless there's strong reason to change.
- HTTP server in `server.js:75` does its own path-traversal check via `path.join(__dirname, 'renderer', url)` + `startsWith` — preserve this when adding new static routes.
- WS port **3456** is hardcoded in both `main.js` (where StatusServer is constructed) and `renderer/app.js` (the `window.location.host` used to build the WS URL). If changing, update both.
- WebSocket reconnection in `app.js:144` uses exponential backoff capped at 30s.
