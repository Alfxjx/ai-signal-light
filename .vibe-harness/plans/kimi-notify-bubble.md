# 悬浮球 LED 右侧显示 Kimi NotifyUser 消息（kimi-notify-bubble）

## 目标
Kimi Code（web 模式）会话里调用 `NotifyUser` 工具时，把消息内容显示在**悬浮球指示灯右侧**的气泡里，约 15 秒后自动隐藏、悬浮球恢复紧凑尺寸（用户已确认）。

## 数据链路
```
kimi web WS ──tool.call.started──▶ kimi-monitor.parseNotifyCall()
        ──▶ KimiStatus.notify {message, ts} ──kimiStatus 消息──▶ FloatingBall.vue
        ──▶ 气泡显示 + IPC set-width(72+260) ──15s TTL──▶ 隐藏 + set-width(72)
```

## 改动文件
- `src/shared/types/kimi.ts` — 新增 `KimiNotify`，`KimiStatus.notify?`
- `src/main/kimi-monitor.ts` — 导出 `parseNotifyCall(event)`；`handleWsMessage` 在 session_id 门禁前消费 `tool.call.started` / `tool.result`；`buildStatus` / `publish` key 带 notify
- `src/main/main.ts` — 新增 `floating-ball:set-width` handler（setSize 保持左上锚点向右扩展）
- `src/main/preload.ts` — 通道常量 + `floatingBall.setWidth`
- `src/shared/types/ipc.ts` — `IPC_CHANNELS` 加 `FLOATING_BALL_SET_WIDTH`；`ElectronAPI.floatingBall.setWidth`
- `src/renderer/src/FloatingBall.vue` — 气泡元素 + watch notifyMsg + 15s TTL + setWidth
- `src/renderer/src/styles/floating-ball.css` — body/.fb 宽度 100%，LED 绝对定位，`.fb-bubble`
- `src/main/kimi-monitor.test.ts` — parseNotifyCall 5 用例

## 验证
- `npm test` 116 全过（+5 parseNotifyCall）
- `npm run typecheck`、`build:main`、`build:renderer` 通过
- 编译产物冒烟：parseNotifyCall 多形状命中
- GUI 实机需 kimi web 在跑且会话 `[experimental] notify_user = true`

## 人日估算
人工约 0.5 人日；AI 实施 ~30 分钟，节省约 0.45 人日。
