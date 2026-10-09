# 改动记录：悬浮球 LED 右侧显示 Kimi NotifyUser 消息

## 时间
- 2026-09-20

## 需求
Kimi Code（web 模式）会话调用 `NotifyUser` 工具时，把消息显示在悬浮球指示灯**右侧**的气泡里，约 15 秒自动隐藏、悬浮球恢复紧凑尺寸（用户已确认该交互）。

## 原理（文档查证）
- `kimi web` 本地服务 WS（`/api/v1/ws`）事件流含 Tool calls 事件族 `tool.call.started` / `tool.call.delta` / `tool.progress` / `tool.result`；NotifyUser 是普通工具调用，以 `tool_name = NotifyUser` 事件推出（[Server API 文档](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html)）。
- 与 TUI 不同：TUI 的 NotifyUser 只进 Updates 面板、官方无对外通道（只能 PostToolUse hook 旁路）；web 模式走共享会话数据、WS/REST 可直接拿，本次用官方通道。
- 实验性 API：payload 精确 schema 以运行时 `/asyncapi.json` 为准，解析多形状兜底。

## 改动文件
- **`src/shared/types/kimi.ts`** — 新增 `KimiNotify { message; ts }`；`KimiStatus` 增 `notify?: KimiNotify | null`
- **`src/main/kimi-monitor.ts`** — 导出纯函数 `parseNotifyCall(event)`（仅 `tool.call.started`/`tool.result`、`tool_name==='NotifyUser'`、取 `input/tool_input/arguments/payload.message`，兜底返回 null）；`handleWsMessage` 在 **session_id 门禁之前**消费这两类事件（tool 事件未必带 session_id）；`buildStatus()` 带 notify；`publish()` 去抖 key 含 notify
- **`src/main/main.ts`** — 新增 `ipcMain.handle(FLOATING_BALL_SET_WIDTH)`：`floatingBallWindow.setSize(width, FB_HEIGHT)`（setSize 保持左上角锚点，只向右扩展）
- **`src/main/preload.ts`** — `IPC_CHANNELS` + `floatingBall.setWidth(width)`
- **`src/shared/types/ipc.ts`** — `IPC_CHANNELS` 加 `FLOATING_BALL_SET_WIDTH`；`ElectronAPI.floatingBall.setWidth`
- **`src/renderer/src/FloatingBall.vue`** — 解构 `kimiStatus`；`notifyMsg` computed；`bubbleVisible` ref；watch：非空 → 显示 + `setWidth(72+260)` + 重置 15s TTL；空/TTL 到 → 隐藏 + `setWidth(72)`；`onBeforeUnmount` 清定时器；模板加 `.fb-bubble`
- **`src/renderer/src/styles/floating-ball.css`** — `html,body`/`.fb` 宽度改 `100%`；`.led` 由 flex 居中改绝对定位 `left:14px; top:14px`（44px 灯，窗口加宽灯不移位）；新增 `.fb-bubble`（右侧 72px 起、单行省略、max-width 260、深色半透明底 + 圆角 + 描边）
- **`src/main/kimi-monitor.test.ts`** — parseNotifyCall 5 用例（started+input / result+arguments / 非 NotifyUser / 缺 message / 未知 type）

## 关键决策 / 坑
- **tool.call 事件放 session_id 门禁前**：`agent.status.updated` 等依赖 `event.session_id`；tool.call 系列未必带，故提前处理、命中即 return，不参与忙态。
- **窗口动态宽度用 `setSize`**：保持左上角锚点，符合"右侧显示"；`floating-ball:move` 按增量 setBounds 已保留宽高，拖宽窗正常；bounds 持久化只存 x/y，宽不落盘。
- **LED 改绝对定位**：flex 居中会在窗口加宽时把灯整体右移，绝对定位锁死 `left:14;top:14` 保证展开/收起灯不跳。
- 下拉锚点 `positionFloatingBallDropdown` 用 `ball.width` 居中：气泡展开期间弹下拉会轻微右移（可接受，未处理）。
- NotifyUser 本身默认关闭：需会话创建时 `[experimental] notify_user = true` 才调得到（实验开关，与本次改动无关）。

## 验证
- `npm test`：11 文件 116 用例全过（新增 5 个）
- `npm run typecheck` / `build:main` / `build:renderer` 通过
- 编译产物冒烟：`node -e` 调 `dist/main/kimi-monitor.js` 的 parseNotifyCall，started+input / result+arguments / Bash / 未知 type 全部正确
- 未做：GUI 实机目测（需桌面环境 + 本机 kimi web 在跑 + 会话开 NotifyUser 实验开关）

## 影响范围
- 仅新增：KimiStatus.notify、kimi-monitor 消费一类 WS 事件、悬浮球动态宽度 + 气泡
- 不影响主面板 / 下拉 / 宠物 / 托盘 / Claude 链路；悬浮球无消息时与改动前完全一致
