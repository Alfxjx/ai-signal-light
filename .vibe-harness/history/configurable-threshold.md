# 用量条颜色阈值配置 - 改动记录

## 改动摘要

把硬编码的 `> 80 / > 50` 颜色阈值暴露为可配置项，三家 provider 共用同一对。

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/shared/types/config.ts` | 新增 `UsageThresholds` 接口 + `DEFAULT_USAGE_THRESHOLDS` 常量；`AppConfig` / `ConfigPartial` 扩展 |
| `src/shared/types/websocket.ts` | `WsMessage` 加 `thresholdsChanged` 变体；`init`/`usageInit` payload 扩展 |
| `src/shared/types/ipc.ts` | `SettingsSavePayload` 加 `thresholds?` |
| `src/main/config.ts` | `DEFAULTS` 加 `thresholds`；新增 `isValidThresholds` 导出；`_load()` / `update()` 合并逻辑 |
| `src/main/server.ts` | `usageInit` payload 携带 `thresholds`；订阅 `configStore.onChange` 广播 `thresholdsChanged` |
| `src/renderer/src/types/messages.ts` | 重导出 `UsageThresholds` / `DEFAULT_USAGE_THRESHOLDS`；`UsageState` / `UsageInitPayload` 扩展 |
| `src/renderer/src/App.vue` | `handleUsageInit` 写入 `usage.thresholds` |
| `src/renderer/src/utils/time.ts` | `barClass` 签名加 `thresholds` 参数 |
| `src/renderer/src/utils/time.test.ts` | 4 条新边界用例 |
| `src/renderer/src/components/UsageCard.vue` | 6 处 `barClass(x)` → `barClass(x, usage.thresholds)` |
| `src/renderer/src/composables/useUsageState.ts` | 新增 reactive `thresholds`；`barLevel` 签名加 `thresholds`；`handleMessage` 处理 `thresholdsChanged`；4 处调用更新 |
| `src/renderer/src/Settings.vue` | 新增 "用量阈值" 段（两个 number 输入 + 行内校验 + 保存按钮 disabled） |

## 关键决策

1. **WS 推送而非 IPC 拉取**：主进程订阅 `ConfigStore.onChange`，变更即广播；主窗口/悬浮球无需重启即生效。
2. **严格大于**：阈值用 `>` 比较，恰好等于 warn/danger 不会升级颜色（与改前 `> 80 / > 50` 行为一致）。
3. **后端兜底**：`update()` 在 `isValidThresholds` 失败时静默忽略 partial；UI 已用 `thresholdsValid` 禁用保存按钮。
4. **类型共享**：`DEFAULT_USAGE_THRESHOLDS` 放在 `shared/types/config.ts`，main / renderer 同一常量源。

## 验证

- ✅ `npm run typecheck` 通过
- ✅ `npm test` 38/38 通过（time.test.ts 4 条新边界用例）
- ✅ `npm run build:main` 干净

## 后续可考虑

- `simplify` skill：把 `barClass` / `barLevel` 重复逻辑提到 `src/shared/utils/thresholds.ts` 共享；`isValidThresholds` 已在 shared 形式，Settings.vue 内联校验可改用。
- 阈值对可考虑扩到三档（fresh / warn / danger），引入中间过渡。
