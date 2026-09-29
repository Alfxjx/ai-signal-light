# opencode-usage-plugin-helper-cli

- 时间：2026-09-29
- 范围：新增 CLI 助手，让**没装桌面程序**的 opencode 用户能自助配置用量侧边栏插件
- 新增：`opencode-usage-plugin-helper-cli/**`（独立 npm 包，零第三方运行时依赖）

## 起因

用户问「opencode 用户没装我的程序，需要做哪些配置」。梳理后确认三道坎：

1. 不知道插件只读 `%APPDATA%\AI状态监控\config.json`（平时由桌面程序生成）
2. 不知道每家需要什么字段、值从哪个控制台拿
3. 不知道 opencode 的插件转发文件要手动建（`cli.json` 的 `plugins` 实测不生效），
   且 `npm install --legacy-peer-deps` 是**运行时**前提

## 范围（用户确认：doctor / init+set / install）

不做 `check`（实测凭据，需网络）与 `providers`（列配置项，doctor 已带出缺失字段）。
因此本 CLI **零网络、零第三方依赖**（只用 Node 内置 + readline）。

## 关键设计决策

### 1. 路径一致性：本地副本 + 对照测试，而不是跨包 import

理想方案是 CLI 直接 `import` 插件的 `configPath()`。**实践中行不通**：
跨包编译时 `tsc` 的 `rootDir` 只能取一个，而源码在 `src/`、产物在 `dist/`、
插件在另一个目录 —— 相对路径深度必然在某种布局下算错。

改为：CLI 持本地副本，用 `src/drift.test.ts` **对照测试**防漂移 ——
直接 import 插件的实现，断言 `configPath()`（多种 APPDATA 环境）与
`displayWidth()`（中英文混排）两边结果相同，且 CLI 列的 provider id 插件都认。

### 2. 两个安全约束（config.json 与桌面程序共用）

- **原子写**：`.tmp` → `rename`
- **只动自己管的键**：`window` / `pet` / `floatingBall` / `lanMode` / `hooks` /
  `intervalMinutes` 一律原样保留

### 3. 火山只要 AK/SK（用户订正）

最初把 `cookie` + `csrfToken` 也列为可配项。用户指出 **cookie 约一周就失效**，
而插件是只读的（故意不回写避免与桌面程序互相覆盖），过期只能报错 ——
给一个必然过期的选项等于埋雷。已从 CLI 移除该通道，只留 AK/SK。

## 真机 smoke 测出的 bug（都已修 + 补回归测试）

### `init --force` 整文件覆写，清空桌面程序字段

第一次 smoke：准备一份含 `window`/`pet`/`lanMode` 的真实配置，跑 `init --force` 后
`pet` 与 `lanMode` **全部丢失**，`deepseek.token` 也被清掉。

原因：`--force` 分支自己构造了一份全新骨架直接 `writeConfigAtomic`，
只顺手保留了 `thresholds` —— 正是我在计划里写明「绝不允许」的整文件覆写。

修法：`resetOwnedKeys(existing)` = 浅拷贝 + **整节点替换** provider。
浅拷贝保留桌面字段；整节点替换（而非深合并）才能丢掉旧凭据，让 `--force` 真正等于重置。
补了 `src/init.test.ts`：含「桌面字段一个都不能丢」的回归用例。

### 非交互提示误导

`set volcengine` 在非 TTY 下提示「可以用 `--token`」—— 但火山是多字段，`--token` 明确不支持。
改为按字段数给不同提示。

### CJK 对齐

`doctor` 用 `String.padEnd` 对齐，中英文混排错开（`火山` 数 2 列却占 4 列）。
加 `padDisplay()` 按显示宽度补齐，`where` 同样处理。

### ESM 后缀与仓库根定位

- `tsc` 不会补 `.js` 后缀，Node ESM 要求显式 → 漏了就是运行时 `ERR_MODULE_NOT_FOUND`
- 不能按「上溯固定层数」找仓库根（源码与产物深度差一层）→ 改为向上找含
  `opencode-plugin/src/tui.tsx` 的祖先目录

### `--json` 混入 ANSI

详情文本里的 `dim()` 会把转义码写进 JSON。改为详情保持纯文本，着色留到打印时做。

## 端到端验证（隔离的临时 APPDATA，未碰真实配置）

| 场景 | 结果 |
|---|---|
| `init` 生成骨架 | 五家 `enabled:false` + 默认阈值 |
| `set kimi --token` | 写入并自动 `enabled:true` |
| `set volcengine`（非 TTY） | 正确拒绝并给对提示，exit 1 |
| 覆盖含桌面字段的配置后 `set` | `pet` / `window` / `lanMode` / `floatingBall` / `thresholds` / 他人 provider **全部保留** |
| `init --force` | 凭据清空、阈值保留、桌面字段保留 |
| `doctor` 零家启用 | 提示「侧边栏会是空的」，exit 1 |
| `install --force` | 生成的相对路径**与你原有手写 stub 完全一致**（验证了路径计算） |

最后一项是最有价值的验证：`install` 算出的
`../../../../Documents/kimi/Workspaces/ai-signal-light/opencode-plugin/src/tui.tsx`
和仓库里实际在跑的 stub 一字不差。

## 验证

- `npm run typecheck` 0 错
- `npm test` **59 passed**（5 个文件）
- 根仓库 `npm test` 不受影响（148 passed，其 `include` 只覆盖 `src/**`）
- 真实 `~/.config/opencode/plugins/usage-sidebar/tui.ts` 未被改动（已核对并清理测试产生的 `.bak`）

## 遗留

- `set` 的交互式掩码输入**未在真实 TTY 下人工验证**（smoke 走的是 `--token` 与「拒绝」路径）
- 不校验凭据可用性（需网络）—— 由插件启动后自行报错
