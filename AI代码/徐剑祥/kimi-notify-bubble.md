# 悬浮球 LED 右侧显示 Kimi NotifyUser 消息（kimi-notify-bubble）

## 目标
Kimi Code（web 模式）会话里调用 `NotifyUser` 工具时，把消息内容显示在**悬浮球指示灯右侧**的气泡里，约 15 秒后自动隐藏、悬浮球恢复紧凑尺寸（用户已确认）。

## 背景（已查证）
- `kimi web` 本地服务 WS（`/api/v1/ws`）事件流含 Tool calls 事件族：`tool.call.started` / `tool.call.delta` / `tool.progress` / `tool.result`；NotifyUser 是普通工具调用，以 `tool_name = NotifyUser` 事件推出（官方 [Server API](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html)）。API 实验性，payload 精确 schema 以运行时 `/asyncapi.json` 为准，解析需防御式。
- `KimiStatus` 经 WS `kimiStatus` 消息 / init 捎带推给渲染层；`useUsageState.kimiStatus` 已是悬浮球数据源。
- 悬浮球窗口固定 72×72、透明置顶 `focusable:false`；LED 44px 居中；拖动走 `floating-ball:move` IPC。

## 数据链路
```
kimi web WS ──tool.call.started──▶ kimi-monitor.parseNotifyCall()
        ──▶ KimiStatus.notify {message, ts} ──kimiStatus 消息──▶ FloatingBall.vue
        ──▶ 气泡显示 + IPC set-width(72+BUBBLE_W) ──15s TTL──▶ 隐藏 + set-width(72)
```

## 改动文件
- `src/shared/types/kimi.ts` — `KimiNotify { message, ts }`；`KimiStatus.notify?`
- `src/main/kimi-monitor.ts` — 导出纯函数 `parseNotifyCall(event)`；`handleWsMessage` 在 session_id 门禁之前消费 `tool.call.started` / `tool.result`（tool 事件未必带 session_id）；`buildStatus()` 带 notify；`publish()` 去抖 key 含 notify
- `src/main/main.ts` — `ipcMain.handle(FLOATING_BALL_SET_WIDTH)`：`floatingBallWindow.setSize(width, FB_HEIGHT)`（保持左上角锚点，只向右扩展）
- `src/main/preload.ts` — 通道常量 + `floatingBall.setWidth`
- `src/shared/types/ipc.ts` — `IPC_CHANNELS` 加 `FLOATING_BALL_SET_WIDTH`；`ElectronAPI.floatingBall.setWidth`
- `src/renderer/src/FloatingBall.vue` — 气泡元素；`watch(notifyMsg)`：非空 → 显示 + `setWidth(72+260)` + 重置 15s TTL；为空/TTL 到 → 隐藏 + `setWidth(72)`
- `src/renderer/src/styles/floating-ball.css` — `html,body`/`.fb` 宽改 100%；LED 改绝对定位 `left:14;top:14`（窗口加宽灯不移位）；新增 `.fb-bubble`
- `src/main/kimi-monitor.test.ts` — parseNotifyCall 5 用例

## 验证
- `npm test`：116 用例全过（新增 5 个 parseNotifyCall）
- `npm run typecheck`（vue-tsc + tsc）通过
- `npm run build:main` / `build:renderer` 通过
- 编译产物冒烟：`dist/main/kimi-monitor.js` 的 parseNotifyCall 对 started+input / result+arguments / Bash / 未知 type 返回正确
- 未做：GUI 实机（需桌面环境 + kimi web 在跑 + 会话 `[experimental] notify_user = true`）

## 影响范围
- 仅新增：KimiStatus.notify 字段、kimi-monitor 消费一类 WS 事件、悬浮球窗口动态宽度 + 气泡
- 不影响：主面板 / 下拉 / 宠物 / 托盘 / Claude 链路；悬浮球默认 72px 布局与交互不变（无消息时与现在完全一致）
- 已知副作用：气泡展开期间点 LED 弹下拉，下拉水平锚点用 `ball.width` 居中会轻微右移（可接受）
- 风险：WS tool.call payload 实验性字段，解析多形状兜底；字段不符则气泡不显示（打 warn），不影响其它功能
