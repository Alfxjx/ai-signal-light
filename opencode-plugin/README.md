# opencode-usage-sidebar

opencode TUI 侧边栏插件：显示 Kimi / MiniMax / 火山 Coding Plan / DeepSeek / MiMo 用量。

## 数据来源

只读 `%APPDATA%\AI状态监控\config.json`（正式版 userData），**绝不写回** ——
cookie / CSRF 的续期回写由桌面应用独占，两边同时写会互相覆盖。

只渲染 `enabled === true` 的 provider；`enabled` 但 `token` 为空的那家会显示成灰色「未配置」（不静默隐藏）。

> ⚠️ 插件不读 `AI状态监控-dev`，也不支持环境变量覆盖路径。

## 界面

- 表头一行 `▾ 用量 ⟳` + 右侧 `刷新新鲜度`（首屏拉取中显示 `拉取中…`），下面接五家。
  - 表头左侧的 `⟳` 是**刷新按钮**：点它立即重拉（等价 `/usage` / `Ctrl+Alt+U`），
    拉取进行中会变灰当忙碌指示。它自己 `stopPropagation`，所以点它只刷新、**不会顺带折叠**。
- **每家行右端都有一个单家刷新按钮 `⟳`**（百分比型的标题行、余额行、以及出错的 provider 行）：
  点它只重拉这一家（绕过失败退避），拉取中这个按钮变灰。它不弹 toast，
  也**不改表头的「新鲜度」** —— 新鲜度代表整份快照最后一次**全量**刷新的时间，
  只刷一家不该冒充全量新鲜。`configError` 那条没有对应 provider，因此不带按钮。
- **供应商名与窗口标签左边缘对齐**：供应商名前的 `▌` 色条用 `providerMark()` 按
  **显示宽度**补齐到 `LABEL_WIDTH`（2 列），并套一个 `width={LABEL_WIDTH}` 的 box 锁死。
  不能靠「色条 + 手打一个空格」凑 2 列 —— `▌`(U+258C) 属于 East-Asian Ambiguous，
  实际宽度取决于终端字体，换个字体就错位。
  余额型（DeepSeek / MiMo）也套同一个 `width={LABEL_WIDTH}` 前缀盒，保证两列边界重合。
- **有外框**：`border` + `borderStyle="rounded"` + `theme.border.base`，
  与 `opencode-tokenwatch` 一致，把整块用量和侧边栏其它内容视觉隔离。
  `paddingX={1}` 是必需的 —— 边框吃掉左右各 1 列，不留白文字会贴在线上。
  边框占掉的 2 列由 `flexGrow` 自动吸收，不需要重算列宽。
- **布局交给 yoga，不手算列宽**：标签 / 百分比 `flexShrink={0}` 永不被压，
  进度条 `flexGrow={1} + flexShrink={1}` 吃掉剩余宽度（空间不足时第一个被压扁），
  倒计时 `flexShrink={1}` 第二个被压掉。拖宽/拖窄侧边栏都自动成立，**不需要测量侧边栏宽度**
  （`sidebar.content` 插槽只给 `sessionID`，量自己的 `width="100%"` 会量到 0 附近，不可靠）。
- **每家多行展开**：百分比型 = 1 行标题（按最紧的窗口着色）+ 每个周期 1 行
  「标签 | 进度条 | 百分比 | 倒计时」；余额型（DeepSeek / MiMo）= 单行「名称 ......... 金额」右对齐。
- **有进度条，点阵风格**：空槽 `·` + 填充 `●`，纯字符不靠背景色，深色主题下不会糊成一片。
  实现上画 256 个点让父盒 `overflow="hidden"` **裁剪**出可见部分，
  所以「能画多宽」完全由 yoga 分配（`flexBasis={0}` + `flexGrow={1}` 从 0 长到满，
  忽略 256 个点的固有宽度）—— **依然不需要测量侧边栏宽度**。
- **固定列宽**：百分比列和倒计时列的宽度由 `layout.ts` 按**本轮数据的最大位数**
  算好并右对齐补齐（`padLeft`），渲染时直接拿字符串长度当 box 宽度。
  于是 `5%` 和 `100%` 右边缘对齐，倒计时 `2d` 和 `400d` 也对齐。
- **两级留白**：窗口行 `marginBottom=1`（同属一家，读成一个紧凑块）；
  每家标题 / 余额 / 错误行 `marginTop=1`，于是「家与家之间」是 2 行，比组内宽一倍。
  终端留白只能按整行计，所以只能是 1 与 2 的关系。
- **可折叠**：
  - **点表头**折叠 / 展开（`onMouseDown` 挂在表头那个 **box** 上，热区横跨整行；
    挂到里面的 `text` 上只会点中文字那几个格子）
  - 或 `Ctrl+Alt+Y` / `/usage-toggle` / 命令面板
  - 折叠后**只剩表头一行**（`▶ 用量` + 新鲜度），不显示任何 provider。
    曾试过在下面加一行「最紧的一家」摘要（`火山 51%`），但那一行长得太像 provider 行，
    用户会读成「这家没被收进去」—— 干脆不给。
  - 折叠态存 `context.storage`，重启后保持。
  - 三角字形与 `opencode-tokenwatch` 保持一致（`▶` 折叠 / `▾` 展开），避免同屏两个插件指示符不一样
  - 点击与命令共用 `toggleCollapsed()` 一个入口，避免两处逻辑漂移
- 百分比一律是「已用 %」：Kimi / 火山直接用接口值，MiniMax 是 `100 - remaining`。
- 百分比恒被 `clamp` 到 0–100（最多 3 位数字，无需千分位）。
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
| 行格式 | 由 `layout.ts` 决定，`tui.tsx` 只做 flex 翻译 | — |
| 告警阈值 | 读 config.json 的 `thresholds` | warn 50 / danger 80 |
| 快捷键 | 刷新 `usage.refresh` / 折叠 `usage.toggle`，可在 cli.json 的 `keybinds` 覆盖 | `ctrl+alt+u` / `ctrl+alt+y` |

## 命令

| 命令 | 快捷键 | 作用 |
|---|---|---|
| `/usage` | `Ctrl+Alt+U` | 立即刷新（= 点表头的 `⟳` 按钮） |
| `/usage-toggle` | `Ctrl+Alt+Y` | 折叠 / 展开侧边栏 |

命令面板里搜「刷新供应商用量」/「折叠 / 展开用量侧边栏」。

刷新完成后弹 toast 汇总，如 `已刷新 5 家（2 家失败）`（有失败时用 warning 变体）。

## 开发

```powershell
npm install --legacy-peer-deps   # 必须带这个 flag，否则 @opencode/theme 与 @opentui/* 会 ERESOLVE
npm test
npm run typecheck
```

调试：改完代码重开 `opencode`；插件加载错误看 `~/.local/share/opencode/log/opencode.log`。

## 代码结构

| 文件 | 职责 |
|---|---|
| `src/format.ts` | 纯字符串处理：百分比 / 货币 / 倒计时 / CJK 显示宽度与截断 / 档位判定 / `pickPrimary`。**不认识渲染** |
| `src/layout.ts` | 纯决策层：`layoutPlan(providers, ...)` → `RenderedBlock[]`。决定画哪些块、什么颜色、什么顺序。**不接收宽度** |
| `src/tui.tsx` | 渲染层：把 `RenderedBlock` 翻译成 `<box>` 树 + 轮询 / 退避 / 命令注册 |

`layout.ts` 刻意不接收宽度，列宽与窄栏降级全部由 opentui 的 yoga 布局承担。
这样宽度策略不需要单测，拖动侧边栏也不需要重算逻辑。

## 踩过的坑

- **`sidebar.content` 插槽是可以响应鼠标的**，别想当然认为「只读插槽不能交互」。
  `Renderable` 有 `onMouseDown` / `onMouseUp` / `onMouseOver` 等回调，
  参照 `opencode-tokenwatch` 的 `dist/tui.js`（`_$setProp(_el$2, "onMouseDown", ...)`）。
  **关键：要挂在包住整行的 `box` 上，不要挂到里面的 `text`** ——
  挂 text 的话点击热区只有那几个字形格子，用户会以为没生效。
  （本插件一度在 README 里断言「不可点击」，被用户实际点击打脸。）
- **嵌套可点区域要 `event.stopPropagation()`**：表头整行 `onMouseDown` 是「折叠」，
  里面的刷新按钮 `⟳` 也挂 `onMouseDown`；不调用 `stopPropagation()` 的话，
  事件会从按钮冒泡到表头 → 点刷新顺手把侧边栏折叠了。
  `@opentui/core` 的 `MouseEvent` 有 `stopPropagation()`（`processMouseEvent` 冒泡前会检查它）。
  另外热区要覆盖字形前的空格（把空格放进按钮的 `text` 里），否则挨着字的空格点不到。
- **测量尺寸要用 `onSizeChange`**，不是 `queueMicrotask` 里读 `.width`
  （tokenwatch 也是这么做的）。不过本插件已经不需要测宽度，见下条。
- **不要试图测量侧边栏宽度**。`sidebar.content` 插槽只给 `{ sessionID }`；
  给自己的容器写 `width="100%"` 再用微任务读它的 `width` 会量到 0 附近的脏值
  （实测导致进度条消失、百分比被截成 `33…`、弹性占位塌成 0）。
  正确做法是用 `flexGrow` / `flexShrink` 让布局引擎分配空间。
- **色块 / 符号的对齐不能靠字符宽度**。`▌`(U+258C)、`▶`(U+25B6) 这类
  East-Asian **Ambiguous** 宽度字符，在不同终端字体下可能是 1 列也可能是 2 列。
  要对齐就用 `displayWidth()` 显式补齐 + 固定宽度 box 兜底，别手打空格凑数。
  （本插件的 `format.displayWidth` 用的就是显式码点区间表，不依赖 `string.length`。）
- **长字符串当子节点时必须 `flexBasis={0}`**。点阵进度条画了 256 个字符，
  若不把 flexBasis 归零，盒子的固有宽度会按 256 列去参与布局，bar 会被挤爆。
  配合 `overflow="hidden"` 裁剪，才是「内容随便长、可见宽度由 flex 决定」。
- **`KeymapCommand.title` 是 `string` 不是 getter**，写成 `() => ...` 过不了 typecheck。
- **主题色类型是 `RGBA` 不是 `string`**（`context.theme.text.feedback.*.base`）。
- `Context` **不是** `@opencode/plugin/tui` 的顶层导出，只有 `Plugin.Context`。不要写
  `import type { Context } from '@opencode/plugin/tui'`（实测报 TS2305），靠 `Plugin.define` 的上下文推断拿类型。
- `context.keymap.layer()` **必须由组件调用**：放进 `setup()` 会报 `Keymap.Provider is missing`，
  且 `setup` 抛异常会让之前注册的 `sidebar.content` 插槽一起失效 → **侧边栏整块空白**。
  正确做法是把命令注册放进 `append: 'app'` 的插槽 render，并把注销函数加进 cleanup。
- `<Match>` 的 children 参数**不会自动收窄**联合类型，要显式标注
  （`{(b: () => WindowBlock) => ...}`）并配一个 `asKind(block, 'window')` 守卫，否则 TS 报
  `Property 'x' does not exist on type RenderedBlock`。
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
- 折叠/展开状态存在 `context.storage`，跟随 session 持久化
