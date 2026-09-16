# 实施计划：主面板新增「Kimi Code (web)」实时状态卡

## 目标

用户主要使用 `kimi web`，需要在 AI状态监控 主面板增加一张卡片，实时展示：
- 头部：四态聚合徽标（待审核 > 编辑中 > 思考中 > 空闲）／离线
- 目录行：按会话 `metadata.cwd` 归并，每行显示 实时忙态圆点 + 目录名 + 最近活动时长（复用 `formatAge`/`ageClass`），`pending_interaction != none` 点亮红点

离线（服务连不上）：整卡用 `v-if` 隐藏；连上自动出现。

## 原理（来自 Kimi-pet-engine 参考，本机已实测）

- 服务发现：`~/.kimi-code/server.token` 拿 token；端口读 `~/.kimi-code/server/instances/*.json` 的 `port`，兜底 `58627` 起探 100 个端口；探活 `GET /api/v1/healthz`
- REST：`GET /api/v1/sessions?page_size=100` + `Authorization: Bearer <token>`，含 `busy`/`pending_interaction`/`title`/`metadata.cwd`/`updated_at`
- WS：`ws://127.0.0.1:{port}/api/v1/ws`，鉴权 header `Sec-WebSocket-Protocol: kimi-code.bearer.<token>`；先 `subscribe` 会话；`ping` 必须回 `pong`；事件 →
  - `agent.status.updated` `phase.kind`：`running|tool_call`=思考，`streaming`(stream=thinking→思考 / 正文→编辑)，`idle|done|completed`=结束
  - `event.approval.requested`/`event.question.requested`=待审核；`resolved`/`answered`/`dismissed`=回思考
  - `turn.ended`/`turn.step.interrupted`/`error`=回空闲；`event.session.created`=补订阅
- 聚合：任一待审核 > 任一编辑中 > 任一思考中 > 全空闲
- 每 3s REST 轮询校准（兜底漏事件/卡状态），连续失败 3 次判定连接已死断开重连

> 该 API 为实验性，字段随 Kimi Code 版本可能变化。

## 改动文件

### 新建
- `src/shared/types/kimi.ts` — KimiSessionState / KimiAggregateState / KimiProject / KimiStatus / RestSession
- `src/main/kimi-monitor.ts` — KimiMonitor 类（WS 订阅 + REST 校准 + 聚合 + publish 变更推送）；导出纯函数 `mapPhase`/`aggregateState`/`buildProjects`/`reconcile` 便于测试
- `src/main/kimi-monitor.test.ts` — Vitest 覆盖纯函数（mapPhase / aggregateState / buildProjects / reconcile）
- `src/renderer/src/components/KimiCard.vue` — 卡片组件（复用 `.status-card[data-assistant=claude]` 的透明样式、`.claude-header/.project-list/.project-row/.project-name/.project-time/.hook-badge/.age-*`）
- `AI代码/徐剑祥/kimi-web-status.md` — 计划副本（对齐用户级规则）

### 修改
- `src/shared/types/websocket.ts` — WsMessage 增加 `{ type:'kimiStatus'; data: KimiStatus }`，init 的 data 增加可选 `kimi?`
- `src/main/server.ts` — 注入 `kimiMonitor`；connection 的 `init` 捎带 `kimi`；`onChange`→广播 `kimiStatus`；refresh 调 `kimiMonitor.refresh()`；start/stop 生命周期
- `src/main/main.ts` — `new KimiMonitor()` 传入 StatusServer
- `src/renderer/src/types/messages.ts` — 导出 Kimi 类型 + WsMessage 一并更新
- `src/renderer/src/App.vue` — 维护 `kimiStatus` ref；handle 'init'/'kimiStatus'；模板渲染 `<KimiCard>`
- `src/renderer/src/styles/main.css` — 新增 `.status-card[data-assistant=kimi]` 透明外壳 + `.kimi-state-badge` + 各行 `.kimi-state-dot` + compact 规则

## 步骤

1. ws 连接 + REST 轮询 + 聚合实现（kimi-monitor.ts），纯函数拆出供测试
2. shared 类型 + WsMessage
3. server.ts / main.ts 接线
4. 前端 KimiCard.vue + App.vue + messages.ts + main.css
5. `npm run build:main` / `npm run typecheck` / `npm test` 验证
6. `.vibe-harness/history/kimi-web-status.md` + 更新 `index.md`

## 验证

- `npm run typecheck` 通过（renderer + main）
- `npm test` 通过（新增 kimi-monitor.test.ts）
- `npm run build:main` 编译出 `dist/main/kimi-monitor.js`
- 手动：本机 kimi web 已在本机跑（端口 58627），起 dev 后主面板应出现「Kimi Code (web)」卡并实时更新