# desktop-shadcn-redesign — 桌面端 4 窗口迁移 shadcn 风格（明暗双主题）

- 时间：2026-10-12
- 计划：`.vibe-harness/plans/desktop-shadcn-redesign.md`（同 `AI代码/徐剑祥/desktop-shadcn-redesign.md`）

## 改动摘要

把 Electron 客户端的**主面板、设置窗口、悬浮球/宠物共用下拉、托盘悬停弹窗** 4 个窗口从手写全局 CSS 迁移到 **shadcn-vue 官方工具链**，并新增**明/暗/跟随系统**三档主题。悬浮球 LED（拟物像素灯）与桌面宠物（图集播放）不在范围内，保持原样。

### 基础设施
- 新依赖：`tailwindcss@^3.4` + `postcss` + `autoprefixer` + `tailwindcss-animate`（dev）；`reka-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-vue-next`（runtime）
- 新增 `tailwind.config.js`（`darkMode: ['class']`，hsl 变量映射）、`postcss.config.js`、`components.json`（shadcn-vue CLI 用）
- `vite.config.ts` + `tsconfig.json`：`@` 别名 → `src/renderer/src`
- `src/renderer/src/styles/globals.css`：@tailwind 三件套 + 双主题 CSS 变量（`:root` 亮色 zinc / `.dark` 暗色 zinc；primary 沿用强调绿：暗 `#4ade80` / 亮 `#16a34a`）+ 状态色 `--fresh/--warn/--danger/--muted-fg` + `.drag-region`/`.no-drag` 工具类 + 4px 细滚动条
- `src/renderer/src/lib/utils.ts`：`cn()`；`src/renderer/src/composables/useTheme.ts`：`applyTheme`/`useTheme`（getSettings 读主题 + 监听 `theme:changed` + system 跟 matchMedia）
- `src/renderer/src/components/ui/`：源码拷贝式组件 button/input/textarea/select/switch/label/card/badge/separator（reka-ui + cva）

### 主题系统（持久化 + 跨窗口同步）
- `src/shared/types/config.ts`：`AppConfig.appearance: { theme: 'system'|'light'|'dark' }`；`src/main/config.ts`：DEFAULTS 默认 `'dark'`（不惊扰老用户），`_load`/`update` 校验三值
- 新 IPC 通道 `theme:changed`（`shared/types/ipc.ts` + `preload.ts` 自包含通道表同步）；`SETTINGS_GET` 返回 appearance、`SETTINGS_SAVE` 透传；`main.ts` 的 `configStore.onChange` 里主题变化时广播所有 BrowserWindow
- 4 个窗口 HTML 的 `<html class="dark">` 防闪白；设置页顶部新增「外观」区块（主题 Select，选中本地预览，保存持久化）

### 窗口迁移（CSS 大幅删减）
| 窗口 | 文件 | 旧 CSS |
|---|---|---|
| 主面板 | `App.vue`/`TitleBar.vue`（emoji→lucide：Activity/Pin/Settings/Minus）/`ClaudeCard.vue`/`KimiCard.vue`/`UsageCard.vue` | main.css 614→82 行 |
| 设置 | `Settings.vue`（899→902 行，控件全换 ui 组件 + 新增外观区块） | settings.css 389→6 行 |
| 下拉 | `Dropdown.vue` | dropdown.css 226→7 行 |
| 托盘弹窗 | `TrayHover.vue` | tray-hover.css 170→10 行 |

保留的行为：`-webkit-app-region` 拖拽（静态 `drag-region`/`no-drag` 类）、主面板 dock 吸附动画（`.app--docked` 钩子 + main.css 关键帧）、原生 select option 主题色、TrayHover 的 `pointer`/`resize` 上报、全部业务逻辑与文案。

## 影响范围
- 渲染层 4 窗口全部视觉；`dist/` 产物结构新增 `globals-*.css` chunk
- 主进程：`main.ts`（SETTINGS_GET/SAVE + 主题广播）、`config.ts`（appearance）、`preload.ts`（onThemeChanged）
- `landing/`、`android-app/`、`opencode-plugin/` 未动

## 验证
- `npm run typecheck`（vue-tsc + tsc）✅；`npm test` 12 文件 142 用例 ✅；`npm run build:main` + `build:renderer` ✅（多入口 + Tailwind 产物正常）
- 实机目检（明/暗/跟随系统 × 4 窗口、reka-ui Select popper 定位、拖拽区回归、亮色玻璃对比度）需 dev 跑起来确认

## 遗留/坑
- **全局文字色必须显式给 foreground**：`globals.css` 的 base 层原本只有 `background: transparent`，缺 `color: hsl(var(--foreground))`，导致未指定颜色的元素（含 lucide 图标的 `currentColor`）继承浏览器默认黑色、暗色主题下看不见。已修。
- **不要用半透明玻璃底**：首版四个窗口用了 `bg-*/90 + backdrop-blur-xl`，用户反馈要去掉，现全部改为实色（`bg-popover` / `bg-background`）。
- `.drag-region`/`.no-drag` 必须以**静态字符串**出现在模板里，Tailwind 才生成（动态拼接会静默丢拖动）
- reka-ui Select 弹层 portal 挂 body；240px 窄窗口贴边时 popper 定位要实机看
- warn/danger 用量条用 `color-mix(var, hsl(var(--background)))` 柔和版，亮度微调改 main.css 两处百分比
- vue-tsc 在 `:style` 绑定上偶有 `noUnusedLocals` 误报抖动，重跑即过
