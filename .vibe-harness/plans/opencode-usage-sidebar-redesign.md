# opencode-usage-sidebar 重设计计划

## 背景与决策

**现状问题**（`C:\Users\cari\Documents\kimi\Workspaces\ai-signal-light\opencode-plugin\`）：

- `src/format.ts:44-48,127-135` 手工用 `padToWidth`/`LABEL_WIDTH`/`PERCENT_WIDTH` 把多列内容拼成一行文本字符串，再渲染成裸 `<text>`，导致列没对齐、行高虚高、倒计时和百分比之间空白大。
- 5 家 provider 没有视觉锚点，纯靠空行分隔；余额型（DeepSeek/MiMo）和百分比型（Kimi/火山）混排。
- README 第 19 行记录「不做进度条」是 2026-09-28 评审决定，本次要**撤销该决定**，加回进度条。
- `sidebar.content` slot input 只有 `{ sessionID }`，无宽度 —— 因此无法做自适应。但 `<box>` 的 `ref` 可拿到 `Renderable`，其 `.width` 是 yoga 布局后的**响应式 getter**，所以自适应是可行的。

**用户确认方向**：
- 方案 A：flexbox 布局 + 真实进度条（推荐，已采纳）
- 进度条视觉：track 用主题 muted 色，fill 用 level 色（绿/黄/红）
- 撤销「不做进度条」决策

## 设计目标

1. 视觉分组清晰：5 家 provider 一眼可分
2. 对齐由布局引擎负责，不再手算列宽
3. 真正的流式布局：用户拖宽/拖窄侧边栏时内容自适应，无截断、无空白带
4. 不破坏现有数据流（provider/refresh/threshold 逻辑不动）
5. 现有 vitest 测试不得回归

## 架构变更

```
src/
├── format.ts          # 保留：纯文本格式化函数仍被测试覆盖，作为内部 helper
│                      # 不再是渲染输出 —— 输出 RenderedLine[] 这层提到新文件
├── format.test.ts     # 改：测试 formatWindowLine 等纯函数（无渲染耦合）
├── layout.ts          # 新：layoutPlan(snapshot, width, theme) → RenderedBlock[]
│                      # 纯函数，输入 snapshot + 当前可用宽度 + 主题色
│                      # 返回结构化的「应该渲染成什么样」描述（与 opentui 解耦）
├── layout.test.ts     # 新：单测 layout 策略（截断、对齐、分组、状态映射）
├── tui.tsx            # 改：subscribe(layout)，把 RenderedBlock 渲染成 box/text 树
│                      # 进度条用嵌套 box（背景色 + 填充 box）实现
```

**职责分离**：
- `format.ts` —— 纯字符串处理（百分比格式、货币符号、倒计时、CJK 宽度、CJK 截断、标签填充）。逻辑全部下沉到这儿，因为没有渲染依赖容易测。
- `layout.ts` —— 决策层：给定宽度的可用空间，产出「应该有几个窗口行、是否要省略余额型的 meta、label 该多长、bar 走几格百分比」。**完全不知道 box/text 是啥**。这样将来想换渲染后端（比如真的渲染到 web）不用动这层。
- `tui.tsx` —— 渲染层：把 RenderedBlock 翻译成 box/text/ref。`ref` + reactive `.width` 给 layout.ts 喂宽度。

## RenderedBlock 形状（layout.ts 输出）

```ts
export type RenderedBlock =
  | { kind: 'header'; text: string; level: Level }
  | { kind: 'separator' }                     // 横线
  | { kind: 'providerHead'; name: string; level: Level; badge?: '未配置' | '拉取失败' }
  | { kind: 'window'; label: string; percent: number; resetText: string; level: Level }
  | { kind: 'balance'; name: string; amount: string; level: Level }
  | { kind: 'empty'; text: string }
```

注意去掉了"是否渲染分隔符"这种二值布尔，header/separator/head 是独立 kind，避免在 tui 里再 if/else 判断位置。

## 视觉规范（窄栏 ~34 列示例）

```
用量                      2m 前
──────────────────────────────
Kimi
  5h  ▕███████▏            18%  27m
  周  ▕███▏                31%   2d
MiniMax
  5h  ▕███████████▏        55%   1h
  周  ▕██▏                12%   5d
DeepSeek              ¥29.06
MiMo                        －
火山
  5h  ▕██▏                13%
  周  ▕▏                   4%
  月  ▕███████████████▏   100%
```

**视觉锚点**：
- Header：`用量` 与 `刷新 Xm 前` 之间用 `flexGrow={1}` 弹性空间，**完全抛弃当前的双空格固定列**。
- Separator：满栏宽 1 行 `─` 字符，颜色 muted。
- Provider 头：单独 1 行，**着色按最紧窗口的 level**，无窗口时显 `－`。
- 窗口行：左 padding 1（`▕` 用 ASCII `▕` 或 box 边缘都可，下面选 box 边缘）。
- Bar：嵌套 `<box flexGrow={1}>` 不动 —— 子 box `backgroundColor = level 色` 覆盖「已用」宽度。无边框的 box 在窄栏下能自适应到 0 宽。
- 余额行：`flexDirection="row"`，name `flexShrink={1}` + 余额右对齐。

## 自适应宽度测量

```ts
// tui.tsx
let containerEl: BoxRenderable | undefined;
<box ref={(el) => (containerEl = el)} flexDirection="column" width="100%">
  {/* 每 30s 或 onResize 触发：createEffect(() => {
       const w = containerEl?.width ?? 60;
       updateLayout(snapshot, w, theme);
     })} */}
</box>
```

`Renderable.onResize(width, height)` 是 protected，需要 Hook（如有不适用）。**回退方案**：直接读 `containerEl.width` 的响应式 getter（opentui 内部在 yoga 布局后触发依赖），用 `createEffect` 监听。当 `containerEl.width` 变化时调 `updateLayout`。

**最小宽度降级**（layout 决策，不在 tui）：
- `width >= 30`：显示完整窗口行（label + bar + percent + countdown）
- `width >= 20`：省略 countdown，bar 占满中间
- `width >= 14`：只保留 label + percent，bar 变单字符占位
- `width < 14`：warning toast「侧边栏太窄」或降级成纯数字列

## 主题色映射

完全沿用现有 `theme.text.feedback.{success,warning,error}.base` 与 `theme.text.muted`。新增：
- `level === 'fresh'` → `theme.text.feedback.success.base`
- `level === 'warn'` → `theme.text.feedback.warning.base`
- `level === 'danger'` → `theme.text.feedback.error.base`
- `level === 'muted'` → `theme.text.muted`

进度条 track 始终用 `theme.text.muted`。fill 用 level 色。无黑色边框。

## 改动清单

### 新建

- `src/layout.ts`：RenderedBlock 类型 + layoutPlan(snapshot, width, theme) 函数
- `src/layout.test.ts`：测试
  - 窄栏（20-29）降级到无 countdown
  - 极窄（<14）降级到极简模式
  - 余额型与百分比型不同 layout
  - 错误行映射（error=鉴权失败/no_token/拉取失败）
  - provider 排序按注册表顺序（与现有 `enabledProviders` 一致）
  - pickPrimary 选最紧窗口

### 修改

- `src/format.ts`：
  - 保留 `displayWidth`/`padToWidth`/`truncateToWidth`/`formatPercent`/`formatMoney`/`formatCountdown`/`errorLabel`/`pickPrimary`/`levelFor`/`formatHeader` —— 这些是布局无关的字符串函数。
  - 删除 `formatWindowLine`、`formatProviderLines`、`LABEL_WIDTH`、`PERCENT_WIDTH`（仅布局逻辑）。导出 `formatHeader` 等纯函数供 layout.ts 用。
- `src/format.test.ts`：
  - 删除依赖 `formatProviderLines`/`formatWindowLine` 的测试用例
  - 保留 `displayWidth`/`formatPercent`/`formatCountdown`/`formatMoney`/`errorLabel`/`levelFor`/`pickPrimary`/`formatHeader` 测试
- `src/tui.tsx`：
  - 用 `createEffect` + `box ref` 测宽，传给 `updateLayout(snapshot, w, theme)`
  - 把 `<text>` 树换成 `<box flexDirection="row" gap={1}>` 子树（label / bar / percent / countdown 四列）
  - 进度条：嵌套两个 box，外层 `flexGrow={1} backgroundColor={muted}`（track），内层 `width={percent + '%'} backgroundColor={levelColor}`（fill）
  - 删除 `colorFor` 里被替换的语义（仍保留——要给 level 喂颜色 token）
  - 头部分隔符用 `<box height={0}>` 渲染一行 `─`
- `README.md`：
  - 删第 19 行「**不做进度条**」备注
  - 第 16 行「5 家展开」段补：每家头部按最紧窗口着色，窗口行有实时进度条，余额型单独一行
  - 新增一段「布局自适应」：基于 yoga flexbox + ref 测宽，宽度变化时重新 layout

### 不动

- `src/providers/**`、`src/types.ts`、`src/config.ts`、`vitest.config.ts`、`tsconfig.json`、`package.json`
- 主进程 `src/main/**`（README 第 100-108 行要求「改动必须两边同步」——**本次只动渲染层**，provider 数据形状不变，签名函数不动，签名测试不动）

## 测试策略

1. **format.ts 单测保留并精简**（纯字符串，0 渲染依赖）
2. **layout.ts 单测新增**（纯函数，输入 snapshot + width，输出 RenderedBlock）
3. **手动烟测（清单端到端）**：
   - 拉窄侧边栏到 14 列、20 列、34 列、52 列各一次，肉眼检查 bar/倒计时是否按 layout 降级
   - 切换主题（dark/light）确认 level 色跟着换
   - 触发一次失败（断网 → 重新刷新），确认 error 行渲染成「名称 － 原因」红色
   - 余额型 provider（DeepSeek/MiMo）独立显示成单行右对齐
4. **vitest**：`npm test` 必须全绿
5. **typecheck**：`npm run typecheck` 必须 0 错

## 风险与回退

- **风险 1**：opentui 0.5.10 在某些终端（Windows Terminal 旧版）渲染嵌套 box 时背景色错位。**缓解**：方案 B 保留（format.ts 纯函数 + formatProviderLines 旧版）—— git revert 单 commit 即可回退。
- **风险 2**：theme 取色在 setup 时冻结（README 第 117 行「主题色在 setup 时取一次」）。本次 level 色 `tui.tsx:118` `colorFor` 已经是从 `context.theme.text.feedback.*` 取，会被冻结。**缓解**：setup 后每帧 `context.themeMode` 可读，但 theme 对象是固定的；本次**接受冻结行为**，跟现状一致。
- **风险 3**：卸载（disposal）路径要在 slot unclaim 时清掉 createEffect 的 listener（README 第 91 行 keymap 的教训）。**缓解**：把所有响应式状态收敛到 `<box ref>` 指向的同一作用域，cleanup 时 unref。

## 验证流程

1. `npm install`（无需重装，已装）
2. `npm test` —— format 测试 + 现有 provider 测试应全绿
3. `npm run typecheck` —— 0 错
4. 重启 opencode，观察 sidebar
5. 拖动侧边栏宽度，目测降级
6. `Ctrl+Alt+U` 触发刷新，toast 应正常
7. 切换 dark/light 主题，level 色跟随

## 落地步骤（按序）

1. 新建 `src/layout.ts`：定义 RenderedBlock + 写 layoutPlan 主体
2. 新建 `src/layout.test.ts`：把 format.test.ts 里 `formatProviderLines`/`formatWindowLine` 的用例搬过来，针对 layoutPlan 重写（窄/宽/极窄/余额/错误 五种场景）
3. 改 `src/format.ts`：删除 `formatWindowLine`/`formatProviderLines`/`LABEL_WIDTH`/`PERCENT_WIDTH`，保留其他纯函数
4. 改 `src/format.test.ts`：移除已删函数的测试用例
5. 改 `src/tui.tsx`：替换 `<text>` 子树为 `<box>` 子树，接 ref + createEffect
6. 改 `README.md`：撤销「不做进度条」决策，补自适应段落
7. `npm test` + `npm run typecheck`
8. 重启 opencode 端到端验收

## 不在范围内（显式 YAGNI）

- 不引入代理 / 不加 Copilot / Codex（README 第 113 行「已知限制」继续遵守）
- 不做深色主题切换响应（README 第 116 行已知限制）
- 不做可点击交互（hover/click 触发详情）—— slot 只读，opentui sidebar.content 不支持交互回调
- 不改 provider 数据形状，不改签名函数（README 第 100-108 行要求「改动必须两边同步」——本次只动渲染层）