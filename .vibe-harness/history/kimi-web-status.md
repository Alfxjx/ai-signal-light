# 改动记录：主面板新增「Kimi Code (web)」实时状态卡

## 时间
- 2026-09-16

## 需求
用户主要使用 `kimi web`，需在主面板读取 Kimi Code 实时状态（参考 `LJF-0125/Kimi-pet-engine` 的实现）。设计定稿：
- 头部：四态聚合徽标（待审核 > 编辑中 > 思考中 > 空闲）／离线
- 目录行：按会话 `metadata.cwd` 归并，每行 = 实时忙态圆点 + 目录名 + 最近活动时长；`pending_interaction != none` 点亮红点
- 离线整卡 `v-if` 隐藏，连上自动出现

## 原理（本机实测确认）
- 服务发现：`~/.kimi-code/server.token` 拿 token；端口读 `~/.kimi-code/server/instances/*.json` 自报 port，兜底 58627 起探 100 个端口；探活 `GET /api/v1/healthz`。本机实测端口 58627、host_version 0.41.0。
- REST `GET /api/v1/sessions?page_size=100`（`Authorization: Bearer <token>`）：含 `busy` / `pending_interaction` / `title` / `metadata.cwd` / `updated_at`。
- WS `/api/v1/ws`：`Sec-WebSocket-Protocol: kimi-code.bearer.<token>` 鉴权；先 `subscribe` 会话；`ping` 回 `pong`。事件 → `agent.status.updated` `phase.kind`（running/tool_call=思考，streaming 按 stream=thinking/正文 分思考/编辑，idle/done/completed=结束）、`event.approval.requested`/`event.question.requested`=待审核、`resolved`/`answered`/`dismissed`=回思考、`turn.ended`/`turn.step.interrupted`/`error`=回空闲、`event.session.created`=补订阅。
- 每 3s REST 轮询校准（reconcile），连续失败 3 次判定连接已死、复位端口重发现。

## 改动文件
- **新建**
  - `src/shared/types/kimi.ts` — KimiSessionState / KimiAggregateState / KimiProject / KimiStatus / RestSession
  - `src/main/kimi-monitor.ts` — KimiMonitor（WS+REST 校准+聚合+publish 变更去抖）；导出纯函数 mapPhase/aggregateState/buildProjects/reconcile
  - `src/main/kimi-monitor.test.ts` — 12 用例覆盖上述纯函数
  - `src/renderer/src/components/KimiCard.vue` — 卡片组件
- **修改**
  - `src/shared/types/websocket.ts` — WsMessage 增 `{type:'kimiStatus'}`；init data 增可选 `kimi?`
  - `src/main/server.ts` — 注入 kimiMonitor；init 捎带 kimi；onStatusChange→广播 kimiStatus；refresh 触发；start/stop 生命周期
  - `src/main/main.ts` — `new KimiMonitor()` 注入 StatusServer
  - `src/renderer/src/types/messages.ts` — 导出 Kimi 类型
  - `src/renderer/src/App.vue` — `kimiStatus` ref；handle init/kimiStatus；模板 `<KimiCard v-if="kimiStatus?.available">`
  - `src/renderer/src/styles/main.css` — `.status-card[data-assistant=kimi]` 透明外壳 + `.kimi-state-badge`（四态配色）+ `.kimi-state-dot`（行忙态圆点）+ compact 规则
  - `AGENTS.md` — 目录树补 kimi-monitor/组件/kimi 类型，State Model 增 Kimi web 状态条目
  - `AI代码/徐剑祥/kimi-web-status.md` — 计划副本

## 关键决策 / 坑
- **显示名用原始 cwd，分组 key 用归一化 cwd**：`normalizeCwd` 在 Windows 下整体小写，若用归一化路径取目录名会把中文/大小写显示名也变小写。分组 key 可小写，`path.basename(cwd)` 用原始值。
- 无 `metadata.cwd` 的会话退化为按 `workspace_id` 分组、会话标题作显示名。
- 忙态表 `Map<sessionId, KimiSessionState>` 由 WS 驱动（保持编辑/思考细分），REST `reconcile` 只兜底（不覆盖 WS 的 editing 等更细状态）。
- publish 走 JSON key 去抖，避免 3s 无谓刷新；但 streaming 期间 WS 事件实时推头部/行状态。
- 该项目 API 实验性：未知 `phase.kind` 打日志不报错。

## 验证
- `npm test`：8 文件 87 用例全过（含新增 kimi-monitor 12 用例）
- `npm run typecheck`（vue-tsc + tsc --noEmit）通过
- `npm run build:main` / `build:renderer` 通过
- 端到端：用编译产物 `kimi-monitor.js` 连本机服务冒烟，`available=true state=thinking`，按 cwd 归并正确（中文目录/大小写完整，`ai-signal-light` 行 thinking、其余 idle）
- 未做：GUI 实机点开面板目测（需桌面环境）。

## 影响范围
- 主面板新增一张卡（Kimi web 在线时显示，离线自动隐藏）；依赖本机 `kimi web` 服务在跑。
- 不改变现有 ClaudeCard / UsageCard / 悬浮球 / 托盘行为；仅 server 注入新监控并多广播一种 WS 消息。