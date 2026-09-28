# opencode-usage-sidebar

opencode TUI 侧边栏插件：显示 Kimi / MiniMax / 火山 Coding Plan / DeepSeek / MiMo 用量。

## 数据来源

只读 `%APPDATA%\AI状态监控\config.json`（正式版 userData），**绝不写回** ——
cookie / CSRF 的续期回写由桌面应用独占，两边同时写会互相覆盖。

只渲染 `enabled === true` 的 provider；`enabled` 但 `token` 为空的那家会显示成灰色「未配置」（不静默隐藏）。

> ⚠️ 插件不读 `AI状态监控-dev`，也不支持环境变量覆盖路径。

## 界面

- 表头一行 `用量  刷新 刚刚`（首屏拉取中显示 `用量  拉取中…`），下面接五家。
- **每家多行展开**：百分比型 = 1 行标题（按最紧的窗口着色）+ 每个周期 1 行「  标签  百分比  倒计时」；
  余额型（DeepSeek / MiMo）= 单行「名称  金额」。
- **不做进度条**：只有百分比数字（2026-09-28 评审改版，原设计的 5 格 `█░` 条形已去掉）。
- 百分比一律是「已用 %」：Kimi / 火山直接用接口值，MiniMax 是 `100 - remaining`。
- 阈值读 config.json 的 `thresholds`（严格大于判定）：`> danger` 红、`> warn` 黄、其余绿；`no_token` 灰。

## 加载方式

本插件通过 opencode 的**全局插件发现目录**加载，**不要**写进 `cli.json` 的 `plugins`（实测无效）。

`C:\Users\cari\.config\opencode\plugins\usage-sidebar\tui.ts`：

```ts
export { default } from '../../../../Documents/kimi/Workspaces/ai-signal-light/opencode-plugin/src/tui.tsx';
```

- 该文件在仓库外，**不受版本控制** —— 换机器/迁移仓库时要手动重建，路径也要跟着改。
- opencode 会自动发现 `~/.config/opencode/plugins/usage-sidebar/tui.ts`，`cli.json` 与 `opencode.jsonc` 都不用动。
- 本机实测版本：opencode v2.0.14。

### 为什么不用 cli.json

实测（opencode 2.0.14）：`cli.json` 的 `plugins` 里写本地路径**不会被加载，而且零日志**。失败的写法：

| 写法 | 结果 |
|---|---|
| `"file:///C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light/opencode-plugin"` | 不加载 |
| `"C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light/opencode-plugin"` | 不加载 |
| 上面两种 + 给包补 `"."` 主入口（`exports` 同时含 `"."` 与 `"./tui"`） | 不加载 |

判定方法（二选一）：

1. 在 `setup()` 里临时 `appendFileSync` 一行，看文件是否出现（详见实现计划 Task 1 Step 8）。
2. 查 `~/.local/share/opencode/log/opencode.log` 里的 `plugin operation failed` / reconciliation 行。

### 运行时依赖

`npm install` 是**运行时前提**，不只是开发前提：stub import 的 `src/tui.tsx` 位于本目录树内，
Bun 从这里向上解析 `@opencode/plugin/tui` 与 `solid-js`。删掉 `node_modules` 插件会加载失败。

## 配置项

| 项 | 位置 | 默认 |
|---|---|---|
| 刷新间隔 | `src/tui.tsx` 的 `REFRESH_MS` | 5 分钟 |
| 重绘节拍（走字「刷新 Xm前」） | `src/tui.tsx` 的 `TICK_MS` | 30 秒 |
| 失败退避上限 | `src/tui.tsx` 的 `MAX_BACKOFF_MS` | 30 分钟 |
| 行格式 | `src/format.ts` 的 `LABEL_WIDTH` / `PERCENT_WIDTH` | 标签 2 列、百分比右对齐 4 列 |
| 告警阈值 | 读 config.json 的 `thresholds` | warn 50 / danger 80 |
| 快捷键 | 命令 ID `usage.refresh`，可在 cli.json 的 `keybinds` 覆盖 | `ctrl+alt+u`（若无效应在 cli.json 自行绑定） |

## 命令

- 斜杠命令 `/usage` —— 立即刷新
- 命令面板搜索「刷新供应商用量」
- 快捷键 `Ctrl+Alt+U`

三者触发同一轮刷新，完成后弹 toast 汇总，如 `已刷新 5 家（2 家失败）`（有失败时用 warning 变体）。

## 开发

```powershell
npm install --legacy-peer-deps   # 必须带这个 flag，否则 @opencode/theme 与 @opentui/* 会 ERESOLVE
npm test
npm run typecheck
```

调试：改完代码重开 `opencode`；插件加载错误看 `~/.local/share/opencode/log/opencode.log`。

### 踩过的坑

- `Context` **不是** `@opencode/plugin/tui` 的顶层导出，只有 `Plugin.Context`。不要写
  `import type { Context } from '@opencode/plugin/tui'`（实测报 TS2305），靠 `Plugin.define` 的上下文推断拿类型。
- `context.keymap.layer()` **必须由组件调用**：放进 `setup()` 会报 `Keymap.Provider is missing`，
  且 `setup` 抛异常会让之前注册的 `sidebar.content` 插槽一起失效 → **侧边栏整块空白**。
  正确做法是把命令注册放进 `append: 'app'` 的插槽 render，并把注销函数加进 cleanup。
- `npm install` **必须加 `--legacy-peer-deps`**，否则 `@opencode/theme` + `@opentui/*` 会 ERESOLVE。
- MiniMax 接口给的是「剩余 %」，展示的已用 % = `100 - remaining`；Kimi / 火山的 `percent` 本身就是已用 %。
- 火山鉴权失败常返回 HTTP 200 + 响应体 `ResponseMetadata.Error`，必须同时看 body 错误码，不能只看 status。
- 火山 AK/SK 通道缺档时要抛错回退 cookie 通道，不要展示 0。

## 与主进程实现的对应关系（改动必须两边同步）

| 本插件 | 主进程 |
|---|---|
| `src/providers/volcengine-sign.ts` | `src/main/volcengine-sign.ts` |
| `src/providers/kimi.ts` | `src/main/usage-monitor.ts` 的 `mapKimiUsages` / `calcPercent` |
| `src/providers/minimax.ts` | `src/main/usage-monitor.ts` 的 `fetchMiniMax` |
| `src/providers/deepseek.ts` | `src/main/usage-monitor.ts` 的 `mapDeepseekBalance` |
| `src/providers/mimo.ts` | `src/main/usage-monitor.ts` 的 `mapMimoBalance` |
| `src/providers/volcengine.ts` | `src/main/usage-monitor.ts` 的 `fetchVolcengine*` / `mapVolcengineUsage` |

火山 V4 签名两条实现共享同一批官方测试向量（`volcengine-sign.test.ts`），是防漂移锚点。

## 已知限制（v1）

- 不做 Copilot / Codex
- 不支持代理转发（`useProxy`）；五家当前均为 false
- 火山 cookie 过期后只报错，不自动续期
- 主题色在 setup 时取一次，运行中切换主题需要重开
- 重启后「先显示缓存再刷新」尚未验证（用户主动跳过）
