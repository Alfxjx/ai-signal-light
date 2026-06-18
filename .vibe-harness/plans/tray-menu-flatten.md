# 托盘菜单拍平为单层

## Context

`src/main/main.ts` 里 `buildTrayMenu()` 当前是两层菜单——"用量监控"是父项，下面再嵌"刷新周期"子菜单。用户希望把除了"刷新周期"以外的所有项都提到顶层，让托盘一眼能看到所有可操作项。

拍平前结构（2 层）：
```
- 显示/隐藏面板
- 显示/隐藏悬浮球
- ─────
- 用量监控 ▸
  - 启用 Kimi ✓
  - 启用 MiniMax ✓
  - 启用 Copilot ✓
  - ─────
  - 设置 Token…
  - 刷新周期 ▸ (5/10/15/30/60 分钟 radio)
  - ─────
  - 立即刷新
- ─────
- 退出
```

拍平后（保留"刷新周期"为唯一子菜单，并在 label 上展示当前值，与用户已确认的 preview 一致）：
```
- 显示/隐藏面板
- 显示/隐藏悬浮球
- ─────
- 启用 Kimi ✓
- 启用 MiniMax ✓
- 启用 Copilot ✓
- ─────
- 设置 Token…
- 刷新周期 (10 分钟) ▸  ← 唯一子菜单
- 立即刷新
- ─────
- 退出
```

## 改动摘要

### 1. `src/main/main.ts:175-224` — 拍平 `buildTrayMenu` 模板

操作：
- 去掉 `{ label: '用量监控', submenu: [...] }` 这一外层包裹
- 把 6 个子项（Kimi/MiniMax/Copilot checkbox + 设置 Token… + 刷新周期 + 立即刷新）直接放进顶层 `Menu.buildFromTemplate([...])`
- 删除 `用量监控` 子菜单内部的两个 `separator`（一个在 checkbox 之后、一个在刷新周期之后），改用顶层同一个 separator 在 checkbox 之后分组
- "刷新周期" 的 label 改为 `` `刷新周期 (${cfg.intervalMinutes} 分钟)` ``，保留其 `submenu: intervalSubmenu` 不变（用户已选择"保留为唯一子菜单"）
- "退出" 前的顶层 separator 保留

`intervalSubmenu` 构造逻辑（`main.ts:165-173`）和 3 个 checkbox 的 click 行为完全不动——`configStore.update(...)` + `rebuildTray()` 链路不变。

### 2. `README.md:74` — 修正引导路径

把 `右键点击系统托盘图标 → **用量监控** → **设置 Token…**` 改为 `右键点击系统托盘图标 → **设置 Token…**`（去掉"用量监控"这一中间层）。

### 3. `README.md:93` — 修正引导路径

把 `右键托盘 → **用量监控** → **设置 Token…**` 改为 `右键托盘 → **设置 Token…**`。

### 不改的地方

- `CLAUDE.md`：不提及托盘结构，无需改。
- `README.md:15` 的 "**AI 用量监控**"：这是用量监控功能的命名，不是菜单项，保持。
- `README.md:91` 的 "## 用量监控配置"：这是章节标题，不是菜单路径，保持。
- `README.md:24 / 98` 的"刷新周期"：分别是非路径的特性概览和设置面板行为描述，与菜单层级无关，保持。
- `Settings.vue:372-374` 的"刷新周期"：设置面板里的字段标签，与托盘菜单无关，保持。
- `usage-monitor.ts` / `server.ts` / `websocket.ts`：intervalMinutes 的写路径和 WS 广播路径完全不动（已在验证中确认）。

## 关键决策

1. **保留唯一子菜单**：根据用户选择，"刷新周期" 仍为 radio 子菜单；其它全部拍平。代价：菜单不是"纯单层"，但保留了 5 个候选值的可见性。
2. **label 展示当前值**：`刷新周期 (X 分钟)` 让用户在不开子菜单时也能看到当前选中值。
3. **保持 click 行为**：`intervalSubmenu` 内每个 radio 的 click 仍是 `configStore.update({ intervalMinutes: m })` + `rebuildTray()`，与拍平前完全等价。
4. **separator 精简**：原"用量监控"子菜单内有两个内部 separator，拍平后只保留顶层那一个（在 3 个 checkbox 之后），其它项贴在一起，避免视觉噪音。

## 验证

- ✅ `npm run typecheck` 通过（菜单结构类型不变）
- ✅ `npm run build:main` 干净
- 需人工验证：`npm run dev` 启动后
  1. 右键托盘，确认菜单结构如上述 preview
  2. 勾选/取消 启用 Kimi，看主面板对应卡片是否按预期出现/消失 + 托盘菜单勾选状态同步刷新
  3. 点开"刷新周期 (10 分钟)"，选 30 分钟，确认 label 立即变为"刷新周期 (30 分钟)"
  4. 点"设置 Token…"打开设置窗口；点"立即刷新"触发一次 `usageMonitor.checkAll()`
  5. 点"显示/隐藏面板"、"显示/隐藏悬浮球"行为不变
  6. 点"退出"应用关闭

## 注意事项

- 拍平后"启用 Kimi/MiniMax/Copilot"和"立即刷新"的视觉位置变了，但功能路径不变。
- `rebuildTray()` 的触发条件不变（任何 checkbox 切换、interval 切换、settings 保存），所以勾选状态与 label 同步刷新行为保持。
- 不需要新加单测（项目原菜单就无单测覆盖），靠 typecheck + 人工验证。