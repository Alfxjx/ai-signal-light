# 桌面端 UI 迁移 shadcn 风格（明暗双主题）

## 目标

把 Electron 客户端 4 个窗口迁移为 **shadcn-vue** 风格，支持**明/暗双主题**：

1. 主面板（`App.vue` + `TitleBar` + `ClaudeCard` + `KimiCard` + `UsageCard`）
2. 用量监控设置窗口（`Settings.vue`）
3. 托盘悬停速览弹窗（`TrayHover.vue`）
4. 悬浮球/宠物共用下拉窗口（`Dropdown.vue`）

**不在范围内**：`FloatingBall.vue`（拟物像素 LED，无 shadcn 对应物）、`PetView.vue`（图集播放器）、原生托盘右键菜单（主进程 `Menu` API，非渲染层）。

## 现状（已核实）

- 渲染层**无任何样式框架**：无 Tailwind / 组件库 / CSS 变量；6 个窗口各一份手写全局 CSS（`styles/main.css` 614 行、`settings.css` 389 行、`dropdown.css` 226 行、`tray-hover.css` 170 行），11 个 `.vue` 文件全部无 `<style>` 块。
- 纯暗色、玻璃拟态（半透明深色 + `backdrop-filter: blur`），颜色全部硬编码。
- 无 `@` 别名（`vite.config.ts:12-27`，`tsconfig.json` 无 paths）。
- 配置流转：`settings:get` / `settings:save` IPC（`main.ts:1099/1139`），`ConfigStore.onChange` 已存在（`config.ts:216`），主题同步可挂在上面。
- 窗口拖动靠 CSS `-webkit-app-region: drag`，迁移时必须保留。

## 技术选型

- **Tailwind CSS v3.4**（不用 v4：v3 + PostCSS 是 shadcn-vue 官方文档的标准路径，且与 `landing/` 的 3.4 版本一致，避免多入口 + Electron 下踩 lightningcss 的坑）
- **shadcn-vue 官方工具链**：`reka-ui`（无头组件原语）+ `class-variance-authority` + `clsx` + `tailwind-merge` + `tailwindcss-animate`
- **lucide-vue-next**：替换标题栏/按钮上的 emoji 图标（⬡ 📌 ⚙ − 等）
- 组件按 shadcn-vue 惯例**源码拷贝进仓库**（`components/ui/`），不装组件包
- 暗色模式用 `class` 策略（`<html class="dark">`），CSS 变量 hsl 格式

## 实施步骤

### 1. 基础设施

新增依赖（根 `package.json`）：`tailwindcss@^3.4`、`postcss`、`autoprefixer`、`tailwindcss-animate`、`class-variance-authority`、`clsx`、`tailwind-merge`、`reka-ui`、`lucide-vue-next`。

新建文件：

- `tailwind.config.js`（根目录）：`darkMode: ['class']`，content 指向 `src/renderer/src/**/*.{vue,ts,html}`，theme 按 shadcn 惯例映射 hsl CSS 变量（border/input/ring/background/foreground/primary/secondary/muted/accent/destructive/card/popover + radius）
- `postcss.config.js`（根目录）：tailwindcss + autoprefixer
- `components.json`：shadcn-vue CLI 配置（aliases 指向 `@/components`、`@/lib/utils`），方便以后用 CLI 追加组件
- `src/renderer/src/styles/globals.css`：`@tailwind base/components/utilities` + shadcn 双主题 CSS 变量：
  - `:root` = 亮色（zinc 系），`.dark` = 暗色（zinc 暗色系，贴近现有视觉）
  - primary 沿用现有强调绿：暗色 `#4ade80` 系 / 亮色用深一档的绿保证对比度
  - 额外定义状态色变量 `--fresh/--warn/--danger`（明/暗各一套），供用量条和百分比三档着色使用
  - 保留共享窗口特性：`-webkit-app-region: drag/no-drag`、4px 细滚动条、`backdrop-filter` 玻璃底（窗口容器用 `bg-background/85 backdrop-blur-xl` 这类半透明）
- `src/renderer/src/lib/utils.ts`：`cn()`（clsx + tailwind-merge）
- `src/renderer/src/composables/useTheme.ts`：读主题设置 → 给 `<html>` 切 `dark` class；`'system'` 时跟 `matchMedia('(prefers-color-scheme: dark)')` 并监听变化

修改：

- `vite.config.ts`：加 `resolve.alias` `@` → `src/renderer/src`
- `tsconfig.json`：加 `paths: { "@/*": ["./src/renderer/src/*"] }`

### 2. 主题系统（持久化 + 跨窗口同步）

- `src/shared/types/config.ts`：`AppConfig` 加 `appearance: { theme: 'system' | 'light' | 'dark' }`，`ConfigPartial` 同步
- `src/main/config.ts`：DEFAULTS 加 `appearance: { theme: 'dark' }`（默认暗色，不改变老用户现有视觉）；`_load` / `update` 处理 `appearance` 键
- `src/shared/types/ipc.ts` + `src/main/preload.ts` + `src/renderer/src/types/electron.d.ts`：新增通道 `THEME_CHANGED = 'theme:changed'`，preload 暴露 `onThemeChanged(cb)`
- `src/main/main.ts`：
  - `SETTINGS_GET` 返回 `appearance`
  - `SETTINGS_SAVE` 透传 `appearance`
  - `configStore.onChange` 里主题变化时向所有 `BrowserWindow` 广播 `theme:changed`
- 4 个在范围内的入口（main/settings/dropdown/tray-hover）：import `globals.css`，启动时 `useTheme()` 从 `getSettings()` 拿主题应用 + 监听 `onThemeChanged` 即时切换；HTML 模板 `<html class="dark">` 作为默认，避免暗色用户开屏闪白
- `Settings.vue` 新增「外观」区块：主题 Select（跟随系统 / 浅色 / 深色），选中即本地预览，随底部「保存」按钮持久化并广播

### 3. shadcn-vue 基础组件（源码拷贝进 `src/renderer/src/components/ui/`）

按本次页面实际需要建：`button`、`input`、`textarea`、`select`（reka-ui Select，设置页的刷新周期/主题选择用）、`switch`（替换自定义 `.settings-toggle`）、`label`、`card`、`badge`（状态胶囊）、`separator`。用量进度条不套 shadcn Progress，保留自定义条但颜色/圆角全部走 token。

### 4. 逐窗口迁移

通用原则：模板 class 换成 Tailwind 原子类 + `cn()`；状态三档色、hover、过渡全部走 CSS 变量；`-webkit-app-region: drag`（主面板/设置 body 与标题栏）原样保留；Emoji 图标换 lucide；文案不变。

- **主面板**：`App.vue`（容器玻璃底 + dock 吸附动画保留 `.app--docked` 逻辑，动画 CSS 留在窗口级 CSS）、`TitleBar.vue`（lucide 图标按钮）、`ClaudeCard.vue` / `KimiCard.vue`（Card + Badge + 项目列表行）、`UsageCard.vue`（7 家 provider 行、进度条、pace 徽章走 token 色）
- **设置窗口** `Settings.vue`（899 行，工作量最大）：7 个 provider 区块的开关→Switch、凭据框→Input（含显示/隐藏切换按钮）、刷新周期→Select、阈值窄输入→Input、hooks JSON→Textarea、按钮组→Button（variants: default/secondary/outline/ghost/destructive）、说明文字→muted-foreground
- **下拉窗口** `Dropdown.vue`：容器玻璃底、状态胶囊→Badge、用量 mini bar 走 token
- **托盘弹窗** `TrayHover.vue`：容器玻璃底、provider 速览列表、百分比三档着色走 `--fresh/--warn/--danger`

每个窗口原有的独立 CSS 文件（`main.css`/`settings.css`/`dropdown.css`/`tray-hover.css`）**大幅删减**：只保留 Tailwind 表达不了或不该表达的窗口级内容（app-region、dock 动画关键帧、个别动画），其余删除；入口改为 import `globals.css` + 残留窗口 CSS。

### 5. 验证

1. `npm run typecheck`（vue-tsc + tsc 双过）
2. `npm test`（Vitest，确认 utils 测试不受影响）
3. `npm run dev` 实际跑起来，逐个窗口目检：主面板（含 dock 吸附）、设置（含保存往返）、悬浮球下拉、托盘 hover 弹窗；每窗口都切一次 明/暗/跟随系统 三档确认无硬编码颜色漏网
4. `npm run build` 打包冒烟（确认多入口 + Tailwind 产物正常）
5. 确认 `landing/`、`opencode-plugin/` 不受影响（独立包，未动）

### 6. 交付（按 AGENTS.md 固定流程）

1. 本计划文件复制到 `AI代码/徐剑祥/` 和 `.vibe-harness/plans/desktop-shadcn-redesign.md`
2. 更新 `AGENTS.md`（新依赖、ui 组件约定、主题系统说明）+ `.vibe-harness/history/desktop-shadcn-redesign.md` + `index.md`
3. 中文 conventional commit 提交 + `git push`

## 风险点

- **reka-ui Select/Switch 在透明无边框窗口里的 Popper 定位**：Select 弹层默认挂 body，窗口很小（240px 宽主面板），弹层要设 `position="popper"` + 宽度约束，验证时重点看
- **拖拽区域**：Tailwind 重写后 `drag`/`no-drag` 覆盖关系容易回归（按钮必须 no-drag），逐窗口验证拖动
- **明暗主题下的玻璃拟态**：半透明 + blur 在亮色系下对比度要单独调，亮色 token 需要实机目检微调
- **旧 CSS 删干净**：迁移后 grep 一遍旧 class 名（`.settings-toggle`、`.status-card` 等）确认无残留引用

## 节约人日估算

人工完成同等工作（引入并配置 Tailwind + shadcn-vue 工具链、手写 9 个基础组件、迁移 4 个窗口约 2400 行模板与 1200 行 CSS、做明暗双主题 token 体系 + 跨窗口同步、逐窗口回归验证）：约 **6~8 人日**。AI 辅助预计 1 人日内完成，**节约约 5~7 人日**。
