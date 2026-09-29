# opencode-usage-sidebar 侧边栏重设计 + 折叠栏

- 时间：2026-09-29
- 范围：把 opencode TUI 用量侧边栏从「裸文本行 + 手工列宽」改成 yoga flexbox 布局，
  加回进度条（撤销 2026-09-28「不做进度条」决策），新增可折叠栏。
- 涉及文件：`opencode-plugin/src/{format.ts,format.test.ts,layout.ts,layout.test.ts,tui.tsx}`、
  `opencode-plugin/README.md`

## 起因

用户反馈侧边栏「看起来有点不太好看，有点简陋了」，具体两点：**对齐和留白乱** + **缺图形不分组**。
侧边栏宽度不确定（用户会拖动变宽），需要自适应。

## 最终方案

**放弃手工列宽，改用 opentui 的 yoga 布局引擎。**

原来 `format.ts` 用 `padToWidth` / `LABEL_WIDTH` / `PERCENT_WIDTH` 手算列宽再拼字符串，
根因就是「列宽在猜」。现在列宽全部交给 flex：

| 元素 | flex 属性 | 行为 |
|---|---|---|
| 标签 / 百分比 | `flexShrink={0}` | 任何情况下都不被压 |
| 进度条 | `flexGrow={1}` + `flexShrink={1}` | 富余时撑开，紧时第一个被压扁 |
| 倒计时 | `flexShrink={1}` | 再紧第二个被压掉 |

所以拖宽/拖窄侧边栏自动成立，**不需要任何宽度测量或重算逻辑**。

## 踩坑：侧边栏宽度测不准（重要）

第一版走了弯路：给容器写 `width="100%"`，用 `ref` 读它的 `.width`，再用 `queueMicrotask` 延迟测量。

**实测失败**，用户看到的画面是：
```
Kimi
5h33…
周26…
MiniMax
5h16…
DeepSeek¥29.06     ← 弹性占位塌成 0
```
- 进度条整个消失
- 百分比被截成 `33…`
- 名称和金额挤在一起
- 表头 / 分隔线整行不见

原因：`sidebar.content` 插槽只给 `{ sessionID }`，拿不到宽度；自己写 `width="100%"` 再读回来
拿到的是 0 附近的脏值（约 7 列而非真实宽度）。而且终端 resize 没有重测触发器，错了就永远错。

**教训已写进 README「踩过的坑」第一条。** 结论：宽度自适应交给布局引擎，不要自己量。

## 顺带发现的死代码

原计划给百分比加千分位分隔防跳动，但 `clamp()` 把百分比恒定在 0–100，**最多 3 位数字，
千分位永远不会触发**。单测直接暴露了这点（`formatPercent(1000)` → `'100%'`）。
已删除该特性而不是留不可达代码。

## 折叠栏

参考 `opencode-tokenwatch` 的交互（用户指定参考对象）。

- 命令 `usage.toggle`，快捷键 `ctrl+alt+y`，斜杠 `/usage-toggle`，也在命令面板
- `Snapshot` 加 `collapsed: boolean`，存 `context.storage`（重启保持）
- 表头前缀 `▾ 用量` / `▸ 用量`
- 折叠态只剩表头 + **一行「最紧的一家」摘要**（如 `Kimi 31%`，按该家档位着色），
  这样折叠时也能一眼看出该不该展开；余额型不参与评选（没有百分比）
- 侧边栏**不能点击**折叠 —— `sidebar.content` 是只读插槽，无交互回调，只能走命令

## 其它 typecheck 坑

- `KeymapCommand.title` 是 `string` 不是 getter，写成 `() => ...` 编译不过
- 主题色类型是 `RGBA` 不是 `string`（`context.theme.text.feedback.*.base`）
- `<Match>` 的 children **不会自动收窄**联合类型，要配 `asKind(block, 'window')` 守卫 +
  显式标注 `{(b: () => WindowBlock) => ...}`

## 三层职责

| 文件 | 职责 | 认识渲染吗 |
|---|---|---|
| `format.ts` | 纯字符串：百分比/货币/倒计时/CJK 宽度/档位判定/pickPrimary | 否 |
| `layout.ts` | 纯决策：`layoutPlan()` → `RenderedBlock[]`，不接收宽度 | 否 |
| `tui.tsx` | 渲染：`RenderedBlock` → `<box>` 树 + 轮询/退避/命令 | 是 |

`layout.ts` 刻意不接收宽度，窄栏降级由 yoga 承担，所以宽度策略无需单测。

## 第二轮：点阵进度条 + 固定列宽 + 两级留白

用户验收后提了三条：

1. **进度行之间加一点间隙**
2. **实心色块「满」的感觉丑，改成点阵**
3. **百分比和倒计时不等宽，给固定宽度**

### 点阵进度条：靠「裁剪」绕开宽度问题

点阵要用字符画，但字符数得知道列宽 —— 而我们已经决定不测宽度。
解法：`overflow="hidden"` 裁剪。

```tsx
<box flexBasis={0} flexGrow={1} flexShrink={1} height={1} overflow="hidden">
  <box width="100%" height={1} overflow="hidden">
    <text fg={empty}>{'·'.repeat(256)}</text>       {/* 空槽 */}
  </box>
  <box position="absolute" left={0} top={0} height={1}
       width={`${percent}%`} overflow="hidden">
    <text fg={fill}>{'●'.repeat(256)}</text>          {/* 填充，绝对定位盖在上面 */}
  </box>
</box>
```

**关键：`flexBasis={0}`**。不归零的话，256 个字符的固有宽度会参与布局，bar 会被挤爆。
归零后盒子从 0 长到满，**忽略内容宽度**，可见几个点全由父盒裁剪决定。
这条已写进 README 踩坑。

字符选 `●`（填充）/ `·`（空槽）：都是单宽字符，不会错位；比背景色块轻。

### 固定列宽：按本轮数据最大位数算

百分比 / 倒计时列宽由 `layout.ts` 用 `percentColumnWidth()` / `resetColumnWidth()`
扫本轮所有窗口取最大位数，再用 `padLeft` 右对齐补齐。
渲染时**直接拿字符串长度当 box 宽度** —— 不需要额外字段，天然对齐。

> 这两列的宽度**不需要侧边栏宽度**，只有进度条需要（而它交给裁剪）。
> 所以「不测宽度」的原则没有被破坏。

### 两级留白

终端留白只能按整行计，所以只能做成 1 与 2 的关系：
- 窗口行 `marginBottom={1}` —— 同属一家，读成一个紧凑块
- 标题 / 余额 / 错误行 `marginTop={1}` —— 于是「家与家之间」= 1+1 = 2 行，比组内宽一倍

抽成 `WINDOW_GAP` / `PROVIDER_GAP` 常量。

## 第三轮：点击折叠 + 外框

### 点击折叠（推翻自己之前的错误结论）

用户在 README 里读到「不可点击」后实际点了一下，发现点不动。
去查 `opencode-tokenwatch/dist/tui.js` 证实它就是用鼠标事件的：

```js
_$setProp(_el$2, "onMouseDown", toggle.global, _p$.t)
```

**之前的结论是错的** —— `sidebar.content` 完全可以响应鼠标，
`Renderable` 有 `onMouseDown` / `onMouseUp` / `onMouseOver`。当时只读了
`SlotClaim` 的类型定义就断言「只读插槽无交互回调」，没验证。

**关键细节**：`onMouseDown` 要挂在包住整行的 **`box`** 上，不能挂里面的 `text` ——
挂 text 的话热区只有那几个字形格子，用户会以为没生效。

顺带发现 tokenwatch 是用 `onSizeChange` 回调拿宽度的（本插件已不需要测宽度，故未采用）。

### 折叠态改成只剩表头

折叠摘要行（`火山 51%`）被用户读成「火山没被收进去」—— 长得太像 provider 行。
按用户选择：**折叠 = 整个侧边栏只剩表头一行**，删掉 `summary` 块类型。
折叠后就是 `▶ 用量          2m 前`。

### 外框

参照 tokenwatch：`border` + `borderStyle="rounded"` + `theme.border.base`，
外加 `paddingX={1}`（边框吃掉左右各 1 列，不留白文字会贴线）。
边框占掉的 2 列由 `flexGrow` 自动吸收，不需要重算列宽。

三角字形也统一成 tokenwatch 的 `▶` / `▾`（原来用的 `▸`）。

## 验证

- `npm run typecheck` 0 错
- `npm test` **102 passed**（折叠摘要删除后用例从 106 减到 102）
- **待用户验收**：重启 opencode 看外框、点击折叠、只剩一行的折叠态

## 遗留

- 渲染效果未在真实终端肉眼验收（只有单测覆盖 layout 决策层）
- 主题色仍在 setup 时取一次，切换主题需重开（沿用原有已知限制）
