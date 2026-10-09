# landing 重做 + README 刷新

## 时间
2026-09-30

## 分支
`landing-update`（从 `opencode-feat` 切出；`deploy-landing.yml` 只监听 `main`，不合并不会触发部署）

## 改动原因
`landing/` 文案停留在早期版本（只讲 Claude Code + Kimi/MiniMax/Copilot 三家用量 + 扫码配对），
hero 与功能图标是通用占位 PNG（`technical-support.png` / `graph.png`）；README 同样过时
（仅列 3 家 provider、项目结构陈旧、还写着「Kimi Code CLI 已停用」）。
产品已扩展出悬浮球、桌面宠物、顶部吸附、Kimi Code (web) 实时状态、7 家用量、
Android 伴侣、opencode 插件等能力，页面与文档均未覆盖。

## 改动范围

### 视觉基座重做（暗色仪表盘 / LED 风）
- `landing/tailwind.config.js`：`ink` 底色阶 + `led` 状态色（绿 `#5ef08a` / 琥珀 `#ffc53d` / 红 `#ff5c5c` / 灰 `#3a4550` / 青 `#57c7ff`）、`font-mono`、`rounded-panel`、`shadow-panel`、`marquee` / `floaty` 关键帧；补 3–22 / 96 细粒度 opacity 档位（仪表盘大量用 `border-white/12` 这类非默认档）
- `landing/src/styles/tailwind.css`：整体重写
  - base：`body` 底色 + 顶部冷光 / 底部暖光背光；`body::before` 细网格（径向 mask 淡出）；`body::after` 极轻扫描线（3px 周期，`z-index: 0`，被 `z-10` 的 main 压住不糊字）
  - components：`.panel`（小圆角 + 1px 半透明描边 + 内发光 + 背景渐变）、`.ticks`（左上 / 右下角标刻度线）、`.sweep`（面板扫线动画）、`.label` / `.num`（等宽小标签 / 表格数字）、`.btn-primary` / `.btn-ghost`、`.led-*`（含 `led-blink` 红闪 / `led-breathe` 黄呼吸 / `led-dim` 绿微光）、`.bar` / `.bar-fill`（语义统一「已用 %」，`is-warn` / `is-danger` 变体）
  - `@media (prefers-reduced-motion: reduce)` 全量关动效，并把 `.section-reveal` 强制为可见
- `landing/index.html`：title / description / OG / theme-color 全部重写；favicon 换成新增的 `landing/public/favicon.svg`（内联 LED 图形，替代占位 PNG）；`body` 加内联 `background:#07090c` 防白闪
- 删除占位素材 `landing/src/assets/{graph,technical-support}.png`（已无引用）

### 页面结构（9 段）
`App.vue` 重排为：NavBar → Hero → PlatformMarquee → 悬浮球+宠物 → Android → opencode 插件 → 更多功能网格 → HowItWorks → FAQ → Downloads → Footer

- `NavBar.vue` 重写：面板式导航 + LED 品牌标、功能/上手/FAQ/下载锚点、GitHub + 免费下载双按钮、移动端全屏菜单
- `HeroSection.vue` 重写：左文案（本地常驻 / 7 家配额 / 悬浮球 / opencode 插件三档 CTA 与数字），右侧 `PanelMock` + 浮出的 `PhoneMock` + `ws://127.0.0.1:3456` 角标
- `PlatformMarquee.vue`（新）：10 个平台 chip 无缝跑马灯，mask 两侧淡出
- `ShowcaseOrbPet.vue`（新，替代 `FeatureCards.vue`）：大号 `LedOrb` 五态图例（待审核红闪 / 编辑中黄常亮 / 思考中黄呼吸 / 空闲绿微光 / 离线灰灭）+ `DropdownMock` 下拉（最近活跃项目 + Kimi 5h 条）+ 宠物四格交互表与素材来源说明
- `ShowcaseMobile.vue`（新）：手机 mock + CSS 网格二维码占位 + 扫码即连 / 局域网同步 / 阈值通知 / 主题切换四点
- `ShowcasePlugin.vue`（新）：`TerminalMock` 终端侧边栏 + 零侵入 / 可折叠 / 双刷新 / helper CLI 四点
- `MoreFeatures.vue`（新）：六张功能卡（Kimi web 实时状态、七家额度+消耗节奏、顶部吸附收起、托盘悬停速览、Hooks 红点、长期有效凭证通道），线性内联 SVG 图标 + 状态 LED
- `HowItWorks.vue` / `FAQSection.vue` / `SiteFooter.vue` 按新视觉与新事实重写（FAQ 扩到 6 条，补「不需注册」「轮询开销」「不抢焦点」）
- `DownloadsSection.vue`（新）：Windows portable / macOS dmg / Linux AppImage 三卡
- `SectionHeading.vue`（新）：统一 eyebrow + 标题 + 描述，支持左 / 居中
- 删除 `FeatureCards.vue`（3 列通用卡片，含占位图标的旧实现）

### Mock 组件（`landing/src/mocks/`，全部 CSS/HTML 还原，零截图）
- `PanelMock.vue` —— 主面板：标题栏 + Claude Code 项目行（含红点）+ Kimi Code (web) 目录行 + 四条用量条
- `LedOrb.vue` —— 拟物像素灯，`sm/md/lg` 三档尺寸，按状态给灯珠颜色 + 光晕 + 动画类
- `DropdownMock.vue` —— 悬浮球下拉：今日活跃项目 + Kimi 5h
- `PetPixel.vue` —— 11×9 CSS 像素矩阵（主体 / 眼高光），`pixel-hop` 跳动 + running 角标
- `PhoneMock.vue` —— 安卓用量页：连接状态、Tab、DeepSeek 余额条、六张 provider 卡（节奏徽章）、底部导航
- `TerminalMock.vue` —— opencode 侧边栏：表头刷新、五家/余额行、行尾单家刷新、终端上下文、config 路径脚注

### README 刷新
- 描述改为「七家配额 + Claude Code / Kimi Code (web) 项目状态 + 悬浮球 / 宠物 / 吸附 + Android + opencode 插件」
- 功能特性按真实能力分五节重写（项目状态 / 界面形态 / 用量监控 / 手机端 / opencode 插件）
- 新增**用量 provider 与鉴权表**（平台 / 鉴权方式 / 配额窗口，7 行）
- 脚本一览表补 `build:main`、`build:renderer`、`typecheck`、`release*`、`landing:*`
- 项目结构更新到实际文件（含 `edge-dock.ts`、`pet-store.ts`、`kimi-monitor.ts`、`volcengine-sign.ts`、`pet/`、`opencode-plugin/`、helper CLI）
- 状态检测原理补 **Kimi Code (web)** 一节（token / 端口来源、WS 鉴权、REST 校准、四态聚合、列表裁剪）
- 注意事项删掉「Kimi Code CLI 已停用」，改为实验性 API 警告、AK/SK 不下发手机端、opencode 插件只读、dev/打包配置隔离

## 新增/修改文件
- `landing/tailwind.config.js`、`landing/src/styles/tailwind.css`、`landing/index.html`
- `landing/public/favicon.svg`
- `landing/src/App.vue`
- `landing/src/components/`：`NavBar`、`HeroSection`、`PlatformMarquee`、`ShowcaseOrbPet`、`ShowcaseMobile`、`ShowcasePlugin`、`MoreFeatures`、`HowItWorks`、`FAQSection`、`DownloadsSection`、`SiteFooter`、`SectionHeading`（`ScrollReveal` 沿用）
- `landing/src/mocks/`：`PanelMock`、`LedOrb`、`DropdownMock`、`PetPixel`、`PhoneMock`、`TerminalMock`
- 删除：`landing/src/components/FeatureCards.vue`、`landing/src/assets/{graph,technical-support}.png`
- `README.md`
- `.vibe-harness/history/landing-update.md`、`index.md`

## 验证结果
- `npm run landing:build` 通过（`vue-tsc --noEmit` + `vite build`），产物 `landing/dist/`
  - `dist/index.html` 0.96 kB、`index.css` 24.37 kB（gzip 5.90）、`index.js` 98.79 kB（gzip 38.59）
  - `dist/` 产出含 `favicon.svg`，`./favicon.svg` 与 `./assets/*` 相对路径正确（`base: './'`）
- `vite preview` 起在 4173，`HTTP 200` 可访问

## 已知限制 / 下一阶段
- **未做浏览器视觉验证**：本次会话的桌面浏览器未连接，桌面 / 平板 / 手机三档断点与 LED 动画观感需人工过一遍
- 依赖未升级（Vue 3.5 / Vite 5.4 / Tailwind 3.4 保持原样），仍不引第三方 UI 库
- 跑马灯 `animate-marquee` 42s 线性循环，未做 hover 暂停
- 合并到 `main` 后 GitHub Pages workflow 才会触发部署
