# 托盘菜单拍平 - 改动记录

## 改动摘要

把 `buildTrayMenu()` 从两层结构（"用量监控"父项包裹 6 个子项）拍平为单层：除"刷新周期"保留唯一子菜单外，其它 5 项（3 个 checkbox + 设置 Token… + 立即刷新）全部提到顶层；"刷新周期" label 改为显示当前值。

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/main/main.ts` | `buildTrayMenu()`：去掉 `{ label: '用量监控', submenu: [...] }` 包裹；6 个子项直接进顶层 `Menu.buildFromTemplate`；"刷新周期" label 改为 `刷新周期 (${cfg.intervalMinutes} 分钟)`；删除子菜单内 2 个内部 separator（checkbox 之后 + 刷新周期之后），改用顶层同一 separator 在 checkbox 之后分组 |
| `README.md` | 第 74、93 行去掉"用量监控 →"中间层引导文案 |

## 关键决策

1. **保留唯一子菜单**：根据用户选择，"刷新周期" 仍为 radio 子菜单保留 5 候选可见性；其它全部拍平。
2. **label 展示当前值**：`刷新周期 (X 分钟)` 让用户不开子菜单即可看到当前选中。
3. **click 行为零改动**：`intervalSubmenu` 内每个 radio 仍是 `configStore.update({ intervalMinutes: m })` + `rebuildTray()`，与拍平前等价；3 个 checkbox click 同样保持。
4. **separator 精简**：原"用量监控"内 2 个内部 separator 合并为顶层 1 个，避免视觉噪音。

## 验证

- ✅ `npm run typecheck` 通过（vue-tsc + tsc 干净）
- 待人工验证（`npm run dev`）：
  - 托盘右键看到 5 个 checkbox + 设置 + 刷新周期(当前值) + 立即刷新 + 退出
  - 切换 checkbox / interval 后菜单勾选状态与 label 立即同步刷新
  - 设置 Token… / 立即刷新 / 显示隐藏 / 退出 行为不变

## 注意事项

- `intervalMinutes` 写路径未变（仍是 `main.ts` 内 click + `Settings.vue` 保存 + `ConfigStore.update` 通用入口）。
- `usage-monitor.ts` 的 `intervalMs` 重算与 WS `usageInit` 广播链路完全不动。
- 无新增单测：原菜单就无单测覆盖，靠 typecheck + 人工验证。