# 用量侧边栏：表头加「刷新」按钮

- 时间：2026-09-30
- 范围：在 opencode TUI 用量侧边栏表头的「用量」后面加一个可点的 `⟳` 刷新按钮，
  点击立即重拉（等价 `/usage`），拉取中变灰当忙碌指示；点它只刷新、不触发整行折叠。
- 涉及文件：`opencode-plugin/src/{layout.ts,layout.test.ts,tui.tsx}`、`opencode-plugin/README.md`

## 起因
用户要求：「可以给我的侧边用量加一个刷新的按钮吗，就在用量的后面」。
此前刷新只能靠 `/usage` 斜杠命令 / `Ctrl+Alt+U` / 命令面板，侧边栏上没有任何可见入口。

## 改动

### 布局决策层 `layout.ts`
- 新增导出常量 `REFRESH_GLYPH = '⟳'`。
- `RenderedBlock` 的 `header` 成员加字段 `refresh: string`，`layoutPlan` 填 `REFRESH_GLYPH`。
  折叠态也保留（随时能手动刷新）。
- 该字形不参与列对齐，所以没像 `▌` 那样按显示宽度补齐
  （`⟳` 也是 East-Asian Ambiguous，换字体会差 1 列，但不影响任何对齐）。

### 渲染层 `tui.tsx`
- 表头行在「▾ 用量」后插入一个刷新按钮 box：
  - `onMouseDown` 先 `event.stopPropagation()` 再 `props.onRefresh()` ——
    表头整行的 `onMouseDown` 是折叠，不拦冒泡的话点刷新会顺手折叠。
  - 字样是 `` ` ${b().refresh}` ``（含一个前导空格），热区覆盖到空格，避免「挨着字的空格点不到」。
  - 常态用 `context.theme.text.base`（中性色，不与红/黄/绿状态色混淆），
    拉取中 `props.refreshing` 为真时压成 `muted`。
- 新增 `refreshing` 信号：`refreshAll()` 开始时置真、`finally` 里置假（单飞 promise，不会重复触发）。
- 抽出 `manualRefresh()`：`refreshAll(true)` + toast 汇总，**斜杠命令与按钮共用**
  （原来这段逻辑内联在命令的 `run` 里，现在命令改为 `run: manualRefresh`，避免两处漂移）。
- 顺带修命令描述：`折叠后只保留一行「最紧的一家」摘要` → `折叠后只保留表头一行`
  （摘要行在 2026-09-29 的第三轮已删掉，命令描述没跟上）。

### README
- 「界面」表头一行改为 `▾ 用量 ⟳`，说明刷新按钮的行为与忙碌态。
- 命令表 `/usage` 标注「= 点表头的 `⟳` 按钮」。
- 「踩过的坑」新增一条：嵌套可点区域要 `event.stopPropagation()`。

## 关键点（footgun）
- `@opentui/core` 的 `MouseEvent` 有 `stopPropagation()`（`Renderable.processMouseEvent` 冒泡到 parent
  之前会检查 `event.propagationStopped`），这是嵌套可点区的正确做法。
- 点击热区要覆盖字形前的空格：把空格放进按钮的 `<text>` 内容里，否则点空格会落到表头 → 折叠。
- `BlockView` 是纯展示组件，把刷新相关的 props 传下去（第二轮增至 5 个），
  没在组件内部碰 context，保持「渲染层只做 flex 翻译」的分工。

## 验证结果（第一轮）
- `npm run typecheck`（opencode-plugin 内）：**0 错误**。
- `npm test`：**107 passed**（layout 新增 1 条表头刷新按钮用例）。
- **待用户验收**：重启 opencode，肉眼确认 `▾ 用量 ⟳` 的点击只刷新不折叠、拉取中变灰。
  渲染效果仍只有布局决策层的单测覆盖，没做真实终端像素级验收（沿用既有遗留）。

## 第二轮：每个 provider 行的单家刷新按钮

用户追加要求：「给每个 provider 都加一个格子的刷新按钮」。

### 设计调整：刷新不是「布局」而是「渲染」
第一轮把 `⟳` 字形塞进了 `header` 块（`refresh` 字段）。这一轮要给每个 provider 行也放按钮，
**把字形塞进每个块既不必要也啰嗦** —— 字形是纯展示，语义层只需要告诉渲染层「这一行对应哪个 provider」。
所以：
- `layout.ts` 回退 `header.refresh` 字段（以及 `REFRESH_GLYPH` 常量），
  改成为 `providerHead` / `balance` 增加 `id: ProviderId`，`note` 增加可选 `id?: ProviderId`。
- `REFRESH_GLYPH` 移到 `tui.tsx`（与 `PROVIDER_MARK` 同处，都是渲染层字形）。
- 新增渲染层组件 `RefreshCell`：一个「空格 + ⟳」的可点小格，表头与所有 provider 行共用，
  内部统一 `stopPropagation()`。
- `configError` 的 note 不带 `id` → 不渲染按钮（它不对应任何 provider）；
  provider 出错的 note 带 `id` → 就地带按钮，可以直接重试这一家。

### 单家刷新逻辑 `refreshOne(id)`
- 绕过失败退避（手动刷新语义），只 `fetchOne` 这一家，`latest` 就地替换后写回 snapshot。
- 单飞：`singleFlight: Map<ProviderId, Promise<void>>`，同 id 重复点击共享同一个 promise。
- 忙碌态：`refreshingIds` 信号（`ReadonlySet<ProviderId>`，替换整个 Set 以触发重渲染），
  只压暗被点那家的按钮；与表头的全局 `refreshing` 相互独立。
- **刻意不改 `updatedAt`**：表头「新鲜度」代表整份快照最后一次**全量**刷新的时间，
  只刷一家不该把它冒充成全量新鲜（README 已写明）。
- 不弹 toast（避免连续点几个按钮时刷屏）。

### 测试
- `layout.test.ts`：回退表头 `refresh` 断言；其余 provider 相关 `toEqual` 补 `id`；
  新增 `单家刷新按钮的挂载点（provider id）` 一组，断言百分比 / 余额 / provider 错误行都带 id，
  而窗口行与 `configError` 不带。

## 验证结果（第二轮）
- `npm run typecheck`（opencode-plugin 内）：**0 错误**。
- `npm test`：**109 passed**（第一轮 107 + 本轮新增 2 条 id 用例）。
- **待用户验收**：重启 opencode，肉眼确认每家行右端的 `⟳` 只刷该家、被点那家变灰、
  表头新鲜度不动、configError 行没有按钮。
  渲染效果仍只有布局决策层的单测覆盖，没做真实终端像素级验收（沿用既有遗留）。

## 第三轮：刷新按钮紧贴供应商名

用户要求：「刷新的按钮能不能紧贴着 供应商的名字」（原来是推到行尾右对齐）。

- 百分比型标题行 / 余额行：把 `RefreshCell` 从「弹性占位之后」移到「名字之后」，
  于是变成 `▌ Kimi ⟳`；余额行的金额仍被 `flexGrow` 推到最右。
- 错误行：原来名字和原因在同一条字符串里（`Kimi  － 鉴权失败`），按钮贴不到名字上。
  把 note 块拆成 `name` + `text`（`text` 只留 `－ 鉴权失败`），渲染成
  `Kimi ⟳ － 鉴权失败`；`configError` 仍无 `name` / `id`，整行直接铺满。
- `layout.test.ts` 相应更新两条 note 断言（补 `name`、`text` 去掉名字）。

## 第四轮：单家刷新也弹 toast（带供应商名）

用户要求：单家刷新也要 toast，并且要显示刷了哪一家；同时问了 opencode 多 toast 的行为。

- `refreshOne` 完成后弹 toast：成功 `已刷新 <名字>`（success），失败 `<名字> <原因>`（warning，
  原因用 `format.errorLabel`，`no_token` → `未配置`）。
- 之前文档/注释写的「不弹 toast」已全部改正（README + 本文件第二轮段落 + 代码注释）。
- README 补充了宿主 toast 行为说明（一次一条、FIFO、`+N more`、hover 暂停、空队列时新条替换旧条）。

### 扒出来的 opencode toast 逻辑（v2.0.14，来自 bin/opencode.exe 里的 `FK()`）
- 同一时刻只显示 **1 条**，其余进 `queue`，视图渲染 `+N more`。
- `show()` 条件：`if(currentToast && (paused || queue.length>0)) → 入队；否则直接替换当前条`。
- `duration` 默认 **5000ms**；hover 调 `pause()`（扣掉已过时间），移开 `resume()`。
- 这是宿主行为，插件只能 `show()`，无法自定义排队策略。

## 未做
- 没做旋转动画（终端逐帧代价高），忙碌态只用「变灰」表达。
- 没给按钮加 hover 高亮（opentui 有 `onMouseOver`，但当前风格未使用）。
- 单家刷新与全局刷新并发时会各写一次 snapshot（last-write-wins），没做互斥 —— 影响可忽略。

