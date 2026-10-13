# local-tools-status-monitor

- 时间：2026-10-13
- 范围：桌面端主面板新增「本地 Agent」卡片，实时监控三个本地工具运行状态——Codex CLI / ChatGPT 桌面客户端、MiniMax Code (mcode)、opencode。数据源全部本机只读（进程 + 本地文件），每 10s 轮询，经 WS `localToolsStatus` 推送。
- 关联：`src/shared/types/{local-tools,websocket}.ts`、`src/main/{local-tools-monitor,local-tools-monitor.test,server,main}.ts`、`src/renderer/src/types/messages.ts`、`src/renderer/src/components/LocalToolsCard.vue`、`src/renderer/src/App.vue`、`AGENTS.md`

## 背景

用户想监控本机三个 AI 编程工具的运行状态（探索阶段确认数据源可读）：

| 工具 | 命令/进程 | 数据源（实测验证） |
|------|-----------|-------------------|
| Codex + ChatGPT 桌面客户端 | `codex.exe` / `ChatGPT.exe` | `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`（CLI 与桌面版共用；`session_meta.payload.cwd` + 末条 timestamp） |
| MiniMax Code (mcode) | `mcode` | `~/.minimax-code/.mcode-active/<pid>.json`（mcode 自写运行标记）+ `~/.minimax/v2/sessions/**` 文件 mtime |
| opencode | `opencode`（常驻 serve） | `~/.local/state/opencode/service.json`（pid/version/url）+ `~/.local/share/opencode` 最新文件 mtime |

## 关键决策

1. **不读 sqlite**：Electron 28 = Node 18.18，无 `node:sqlite`（22.5+ 才有）；不引 better-sqlite3（原生模块 + Windows rebuild 风险）。mcode 的 `runtime-state.sqlite`（含 status/title/workspace_dir）第一版放弃，用文件级状态。够表达「运行/空闲/离线 + 最后活跃」。后续若补详情需升 Electron 或引入原生依赖。
2. **进程检测两套**：有 pid 的（mcode active 标记、opencode service.json）用 `process.kill(pid, 0)`；codex 无 pid 文件，每轮 `tasklist /FO CSV /NH` 抓进程名匹配 `codex.exe` / `ChatGPT.exe`。
3. **状态判定**：`running && 最后活跃 ≤ 60s → working`；`running → idle`；否则 `offline`。聚合优先级：任一 working > 任一 idle > 全 offline。
4. **坑**：Codex 的 `session_meta` 首行含 `base_instructions` 等大字段，8KB 头部读取会截断首行导致 cwd 解析失败——头部/尾部读取量提到 256KB（实测修复，见下方验证）。
5. 不加 config 开关：数据源存在即显示（与 KimiCard `available` 隐藏一致）。

## 改动

- 新增 `src/shared/types/local-tools.ts`：`LocalToolId` / `LocalToolState` / `LocalToolStatus` / `LocalToolsStatus`
- 新增 `src/main/local-tools-monitor.ts`：纯函数（`readActiveMarker` / `readOpenCodeService` / `parseCodexSession` / `findLatestFile` / `matchProcessNames` / `classifyCodexCwd` / `aggregateToolState` / `buildToolStatus` / `isPidAlive` / `listProcesses`）+ `LocalToolsMonitor` 类（10s 轮询、内容变化才广播）
- 新增 `src/main/local-tools-monitor.test.ts`：18 个用例（marker/service/jsonl 解析、tasklist 匹配、聚合优先级、cwd 分类）
- `src/shared/types/websocket.ts`：`WsMessage` 加 `localToolsStatus`，`init` 捎带 `localTools`
- `src/main/server.ts`：注入 `localToolsMonitor`，init 捎带、broadcast、refresh 触发、启停
- `src/main/main.ts`：实例化 / 注入 / before-quit 停止
- 新增 `src/renderer/src/components/LocalToolsCard.vue`：头部聚合 Badge + 三行（状态点 / 名字 / detail / 最后活跃时间，复用 `utils/time`）
- `src/renderer/src/{types/messages.ts,App.vue}`：导出类型 + 订阅 `localToolsStatus` + 渲染卡片

## 验证

- `npm test`：160 用例全绿（含新增 18 个）
- `npm run typecheck`：通过
- 真实本机采集（编译产物直跑）：
  ```
  codex     running=true  state=working  cwd=C:\Users\cari\Documents\Codex\2026-10-13\ni  | ChatGPT 桌面客户端
  mcode     running=false state=offline  lastActive=昨天 14:47 | v0.6.8
  opencode  running=true  state=idle     lastActive=昨天 16:00 | 127.0.0.1:49374 · v2.0.14
  ```
- 渲染层 `vite build` 编译通过；GUI 卡片待用户重启 dev 实例查看（开发机已有一个旧 dev 实例占用 5173/3456，未擅自杀进程）

## 影响

- 纯增量，不动 detector / kimi / usage 逻辑；只读用户数据，不写任何文件（opencode 密码仅主进程内读取，不下发渲染层）
- 轮询开销：每 10s 一次 tasklist + 数次 stat / 小文件读取，可忽略
