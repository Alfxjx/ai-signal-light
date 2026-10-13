# 本地 Agent 工具运行状态监控（Codex/ChatGPT 客户端 · MiniMax Code · opencode）

## 背景与目标

给 AI状态监控 主面板新增一张「本地 Agent」卡片，实时展示三个本地工具的运行状态：

| 工具 | 命令/进程 | 已实测数据源 |
|------|-----------|-------------|
| **Codex + ChatGPT 桌面客户端** | `codex.exe`（CLI）/ `ChatGPT.exe`（Store 版桌面） | `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`（session_meta.cwd + 最后记录时间戳，**CLI 与桌面版共用**）；可选 `~/AppData/Roaming/Codex/web/Codex/browser-sidebar-page-states.json`（当前标签页标题） |
| **MiniMax Code (mcode)** | `mcode`（npm `@minimax-ai/code`，装在 `~/.minimax-code/`） | `~/.minimax-code/.mcode-active/<pid>.json`（mcode 自写的运行标记 `{pid, startedAtMs}`）；`~/.minimax/v2/sessions/**/messages.jsonl`（mtime = 最后活跃） |
| **opencode** | `opencode`（npm 全局），常驻 `serve --service` | `~/.local/state/opencode/service.json`（`{pid, version, url}`）；`~/.local/share/opencode/`（mtime） |

显示内容：进程是否在跑、聚合状态（工作中/空闲/离线）、最近活跃目录、最后活跃时间、附加信息（版本/端口/当前页面）。

## 关键决策（基于实测）

1. **不读 sqlite**：Electron 28 = Node 18.18，无 `node:sqlite`（22.5+ 才有）；不引入 better-sqlite3（原生模块 + Windows rebuild 风险）。mcode 的 `runtime-state.sqlite`（含 status/title/workspace_dir）**第一版放弃**，改用文件级状态：`.mcode-active` pid 存活 + 会话文件 mtime。够表达「运行/空闲/离线 + 最后活跃」。
2. **进程检测两套**：
   - 有 pid 的（mcode 的 active 标记、opencode 的 service.json）：`process.kill(pid, 0)` 同步检测存活，零开销；
   - 无 pid 的（codex）：每轮 spawn `tasklist /FO CSV /NH` 抓一次进程名列表，匹配 `codex.exe` / `ChatGPT.exe` / `codex-windows-sandbox-server`。
3. **状态判定**：`running && 最后活跃 ≤ 60s → working`；`running → idle`；否则 `offline`。
4. **聚合状态优先级**（卡片头部徽标）：任一 working > 任一 idle > 全 offline。
5. **不加 config 开关**：数据源存在即显示（与 KimiCard 的 `available` 隐藏一致）；用户未要求开关。

## 新增/修改文件

### 新增

**`src/shared/types/local-tools.ts`**
```ts
export type LocalToolId = 'codex' | 'mcode' | 'opencode';
export type LocalToolState = 'working' | 'idle' | 'offline';

export interface LocalToolStatus {
  running: boolean;          // 进程在跑（可靠信号）
  state: LocalToolState;     // 聚合判定
  cwd: string | null;        // 最近活跃工作目录（codex 有，其余可能 null）
  lastActive: number | null; // 最后活跃时间 ms
  detail: string | null;     // 版本/端口/当前标签页等附加信息
}

export interface LocalToolsStatus {
  available: boolean;        // 任一数据源存在 → 渲染卡片
  state: LocalToolState;     // 整卡聚合
  tools: Record<LocalToolId, LocalToolStatus>;
  lastUpdate: number;
}
```

**`src/main/local-tools-monitor.ts`** — 类 `LocalToolsMonitor`（仿 `kimi-monitor.ts` 结构：纯函数 + 监控器）：
- 纯函数（可单测）：
  - `readActiveMarker(dir)` → `{pid, startedAtMs} | null`（mcode active json 解析）
  - `readOpenCodeService(dir)` → `{pid, version, url} | null`
  - `findLatestSession(root)` → `{path, mtime} | null`（递归找最新 jsonl/文件）
  - `parseSessionMeta(jsonlPath)` → `{cwd, timestamp} | null`（读 codex jsonl 首行 session_meta + 末行时间戳，倒读尾部 8KB）
  - `matchTasklist(csv, names)` → boolean（tasklist CSV 解析，Windows）
  - `classifyCodexCwd(cwd)` → `'desktop' | 'cli' | null`（cwd 以 `Documents\Codex\` 开头 → 桌面版）
  - `aggregateToolState(tools)` → `LocalToolState`
  - `buildStatus(…)` → `LocalToolsStatus`
- 监控器：`start()` 每 **10s** 轮询（`setInterval`），`onStatusChange(cb)` 回调，`getStatus()`，`stop()`；内容变化才推送（key 比较，仿 `kimi-monitor.publish()`）。
- 路径常量：`~/.codex/sessions`、`~/.minimax-code/.mcode-active`、`~/.minimax/v2/sessions`、`~/.local/state/opencode/service.json`；用 `os.homedir()`，Windows 路径用 `path.join`。
- 跨平台：`process.platform === 'win32'` 时用 tasklist，其他平台用 `ps -ax -o comm=`（`execFile`）。

**`src/main/local-tools-monitor.test.ts`** — Vitest colocated：
- active marker 解析（含 pid 字段缺失/坏 json）
- service.json 解析
- codex jsonl 尾部读取（fixture：临时目录写小 jsonl，验证取到最新 cwd + 时间戳）
- tasklist CSV 匹配（fixture 字符串）
- aggregateToolState 优先级
- classifyCodexCwd（`Documents\Codex\2026-10-13\ni` → desktop；`D:\codes\moco\...` → cli）

**`src/renderer/src/components/LocalToolsCard.vue`** — 仿 `KimiCard.vue`（shadcn 风格、无 `<style>` 块、语义色 token）：
- 头部：`本地 Agent` + 聚合状态 Badge（工作中=绿 `--fresh` / 空闲=灰 `muted` / 离线=暗灰 `muted/50`）
- 三行（Codex · ChatGPT 桌面客户端 / MiniMax Code / opencode）：
  - 左：名字 + 行内状态点（同 KimiCard DOT_CLASS 配色）
  - 右：`detail`（如 `127.0.0.1:49374 · v2.0.14`）或 `cwd` basename + `formatAge(lastActive, now)`（复用 `utils/time`）
- 全部 offline 且数据源存在时显示三行灰显 + 提示文案；`available=false` 时整卡隐藏（App.vue 控制）

### 修改

**`src/shared/types/websocket.ts`**：
- `WsMessage` 加 `| { type: 'localToolsStatus'; data: LocalToolsStatus }`
- `init` 的 data 加可选 `localTools?: LocalToolsStatus`

**`src/main/server.ts`**：
- `ServerOptions` 加 `localToolsMonitor?: LocalToolsMonitor | null`
- `start()`：init 消息捎带 `localTools: this.localToolsMonitor?.getStatus()`；注册 `onStatusChange` → broadcast `localToolsStatus`；`refresh` 消息触发 `this.localToolsMonitor?.refresh()`；`stop()` 里 `stop()`

**`src/main/main.ts`**：
- import + 实例化 `localToolsMonitor = new LocalToolsMonitor()`；`server = new StatusServer(WS_PORT, { configStore, usageMonitor, kimiMonitor, localToolsMonitor })`；启动/退出清理（对齐 1033-1066、1101 行现有模式）

**`src/renderer/src/types/messages.ts`**：导出 `LocalToolId / LocalToolState / LocalToolStatus / LocalToolsStatus`

**`src/renderer/src/App.vue`**：
- `const localToolsStatus = ref<LocalToolsStatus | null>(null)`
- `handleMessage`：`init` 时读 `msg.data.localTools`；新分支 `msg.type === 'localToolsStatus'`
- 模板在 `KimiCard` 之后加 `<LocalToolsCard v-if="localToolsStatus?.available" :status="localToolsStatus" :now="now" />`

## 实施步骤

1. `src/shared/types/local-tools.ts` — 类型
2. `src/main/local-tools-monitor.ts` — 纯函数 + 监控器
3. `src/main/local-tools-monitor.test.ts` — 测试；`npm test` 通过
4. `src/shared/types/websocket.ts` + `src/main/server.ts` + `src/main/main.ts` — 主进程装配
5. `src/renderer/src/types/messages.ts` + `LocalToolsCard.vue` + `App.vue` — 渲染层
6. `npm run typecheck` + `npm test` 全绿
7. `npm run build:main && npm run dev` 手测：三行状态随进程启停变化；`npm start` 生产模式冒烟
8. 按仓库纪律：`AGENTS.md` 更新、`.vibe-harness/history/<task>.md` + `index.md`、计划另存 `AI代码/徐剑祥/local-tools-status-monitor.md`、conventional commit（中文）推送

## 影响范围

- 纯增量，不动现有 detector/kimi/usage 逻辑；WS 消息加一个类型，渲染层加一张卡
- 只读用户数据，不写任何文件（opencode 密码仅主进程内读取，不下发渲染层）
- 轮询开销：每 10s 一次 tasklist + 数次 stat/小文件读取，可忽略

## 验证

- 单测：`npm test`（新增 colocated 测试 + 全量回归）
- 类型：`npm run typecheck`
- 手测（dev）：启动后卡片显示三家；关掉 opencode 服务进程 → 其行变离线；跑一个 codex 会话 → Codex 行变「工作中」并显示 cwd；mcode 行显示版本与最后活跃
- 生产：`npm run build` 产物 `npm start` 冒烟

## 人日估算

预估人工开发耗时：**0.6 人日**（≈ 4.8 小时）。
依据：类型 + 监控器约 300 行、单测 5 组 fixture、渲染层 1 张卡片（全部仿现有 KimiCard 模式），主进程装配 3 处小改；纯增量无迁移风险。若后续要补 mcode 的 sqlite 会话详情（需升 Electron 或引入 better-sqlite3），另加 0.3 人日。
