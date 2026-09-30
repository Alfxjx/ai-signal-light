# landing 重做 + README 刷新

## 背景
`landing/` 文案停留在早期版本（只讲 Claude Code、Kimi/MiniMax/Copilot 三家用量、扫码配对），hero 与功能图标均为通用占位 PNG；`README.md` 同样过时（仅列 3 家 provider、项目结构陈旧、还写着「Kimi Code CLI 已停用」）。产品已扩展出悬浮球、桌面宠物、顶部吸附、Kimi Code (web) 实时状态、7 家用量、Android 伴侣、opencode 插件等能力，页面与文档均未覆盖。

## 目标
- landing 内容刷新 + 暗色仪表盘 / LED 视觉重做
- 品牌统一为「AI状态监控」
- 界面示意全部用 CSS/HTML 还原，不依赖截图
- README 同步刷新（仅文字，不加截图）

## 分支
从 `opencode-feat` 切出 `landing-update`，landing 与 README 一并提交。
（deploy workflow 只监听 `main`，不合并不会触发部署。）

## Landing 方案

### 视觉基调：暗色仪表盘 / LED 风
- 底色 `#07090c`~`#0b0f14`，叠 CSS 线性渐变网格 + 极轻扫描线
- 状态色贯穿：LED 绿 `#5ef08a` / 琥珀 `#ffc53d` / 红 `#ff5c5c` / 灰 `#3a4550`
- 等宽字体（`ui-monospace`）用于数字、标签、终端 mock；中文用系统字体
- 卡片「设备面板」化：小圆角、1px 半透明描边、角标/刻度线、内发光
- 动效：LED 呼吸/闪烁、数字滚动、面板扫线、复用 `ScrollReveal`
- 纯自定义组件，不引第三方 UI 库；保留 Vue 3 + Vite + Tailwind 3.4，不升级依赖

### 页面结构
1. NavBar — 品牌「AI状态监控」+ 功能/上手/FAQ + GitHub + 下载
2. Hero — 左文案（本地实时 + 多平台额度 + 手机随身看；副标题点 opencode 插件 / 悬浮球+宠物）+ CTA；右侧 CSS 主面板 mock（Claude 项目行 + LED + 用量条）并浮出手机小屏
3. 平台跑马灯 — Claude Code / Kimi / MiniMax / Copilot / DeepSeek / Codex / 火山方舟 / MiMo / opencode
4. 三个主推大区（左右交替）
   - 悬浮球 LED + 桌面宠物（四态灯动画 + 像素宠物）
   - 手机端随身看（手机 mock + 扫码配对）
   - opencode 用量侧边栏插件（终端 mock）
5. 更多功能网格 — Kimi Code (web) 实时状态卡、7 家额度总览 + 消耗节奏、顶部吸附收起、托盘 hover 速览、Claude Hooks 红点提醒
6. HowItWorks 三步 — 下载 → 配监控源 → 扫码随身看
7. FAQ — 支持平台、数据安全、是否开源、如何更新、是否要登录
8. Downloads — Windows portable / macOS dmg / Linux AppImage → Releases
9. Footer

### Mock 清单（全部 CSS/HTML）
- 主面板卡、悬浮球 LED（4 态）、桌面宠物像素形象（CSS/SVG）、手机端屏幕、终端插件面板、7 家用量条

## README 方案
- 标题/描述：覆盖 7 家用量 + Kimi Code web 实时状态 + 桌面宠物/悬浮球/顶部吸附 + Android + opencode 插件
- 功能特性：按真实功能重写分节
- 用量 provider 表：平台 / 鉴权方式 / 配额窗口
- 快速开始 + 脚本表：补 `landing:*`、opencode-plugin 相关
- 项目结构：更新为实际文件
- 状态检测原理：保留 Claude，补 Kimi Code (web)
- 注意事项：清理「Kimi Code CLI 已停用」等过时表述

## 验证
- `cd landing && npm run build` 通过（vue-tsc + vite）
- `npm run landing:preview` 人工检查桌面 / 平板 / 手机断点
- README 人工核对链接与事实

## 交付物
- `landing/src/**`（新旧组件）、`landing/tailwind.config.js`、`landing/src/styles/tailwind.css`
- `README.md`
- `.vibe-harness/plans/landing-update.md`、`.vibe-harness/history/landing-update.md`、`index.md`
