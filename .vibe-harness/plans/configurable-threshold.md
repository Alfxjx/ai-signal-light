# 用量条颜色阈值配置

## Context

进度条颜色档（绿/黄/红）原本硬编码在 `barClass` / `barLevel`（`> 80 = danger, > 50 = warn`）。
用户希望把两档阈值暴露到设置窗口可调，存到现有 `config.json`，三 provider 共用同一对。

## 改动摘要

1. **类型**：`UsageThresholds` 接口加入 `AppConfig` / `ConfigPartial` / `SettingsSavePayload` / `WsMessage`。
2. **config.ts**：`DEFAULTS.thresholds = { warn: 50, danger: 80 }`；新增 `isValidThresholds()` 校验；`_load()` 校验后合并；`update()` 浅合并 + 整体校验。
3. **server.ts**：`usageInit` 携带 `thresholds`；订阅 `configStore.onChange` 广播 `thresholdsChanged`。
4. **time.ts**：`barClass(p, thresholds)` 签名变更（强制 > 边界）。
5. **messages.ts + App.vue**：`UsageState.thresholds` 字段；`handleUsageInit` 把 payload.thresholds 写入 reactive。
6. **UsageCard.vue**：6 处 `barClass(x)` → `barClass(x, usage.thresholds)`。
7. **useUsageState.ts**：新增 reactive `thresholds`；`handleMessage` 处理 `thresholdsChanged` + 从 `usageInit` 读初始值；`barLevel(p, thresholds)` 签名变更 + 4 处调用。
8. **Settings.vue**：新增 "用量阈值" 段，含两个 `type="number"` 输入 + 行内校验 + 保存按钮 disabled 联动。
9. **time.test.ts**：所有 `barClass(x)` → `barClass(x, { warn: 50, danger: 80 })`，新增 4 条边界用例（自定义阈值 + 严格大于）。

## 关键决策

- **单一阈值对**：不分 provider，三家共享，简化 UI。
- **WS 推送**：`ConfigStore.onChange` 触发 `thresholdsChanged` 广播，主窗口/悬浮球无需重启即可生效。
- **严格大于**：阈值比较是 `> warn` / `> danger`，边界值（如正好 50）不升级颜色。
- **行内校验**：warn/danger 输入有 `@input` 校验 + 保存按钮 disabled 联动；后端 `update()` 兜底拒绝非法值。

## 验证

- ✅ `npm run typecheck` 通过
- ✅ `npm test` 38/38 通过（time.test.ts 4 条新边界用例）
- ✅ `npm run build:main` 干净
- 需人工验证：`npm run dev` 启动，设置 `warn=30, danger=70` 后看主面板和悬浮球在已用 31% 变黄、71% 变红；WS 用 wscat 看到 `thresholdsChanged` 消息

## 注意事项

- main 端 `update()` 在 `isValidThresholds` 失败时静默忽略 partial（不报错也不改数据）——设置 UI 已防住。
- `_load()` 用 `isValidThresholds` 校验老 config.json 中的 `thresholds` 字段，损坏则回退默认。
- `DEFAULT_USAGE_THRESHOLDS` 导出在 `src/shared/types/config.ts`，main / renderer 共享。
