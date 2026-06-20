# 新增公网 Landing Page

## 时间
2026-06-20

## 改动原因
为 AI状态监控项目增加一个面向公网的营销落地页，向新用户介绍产品价值、核心功能与上手步骤，并引导下载桌面端。页面需要同时适配手机和电脑端。

## 改动范围

### 新增独立 landing 子包
- `landing/package.json`：Vite + Vue 3 + Tailwind CSS 依赖配置
- `landing/vite.config.ts`：独立构建配置，`base: './'` 适配 GitHub Pages
- `landing/tsconfig.json`：TypeScript 配置
- `landing/tailwind.config.js`：品牌色与玻璃拟态扩展
- `landing/postcss.config.js`：Tailwind + Autoprefixer
- `landing/index.html`：入口 HTML，含 viewport 与 SEO meta
- `landing/src/main.ts`：Vue 应用挂载
- `landing/src/App.vue`：页面整体布局
- `landing/src/styles/tailwind.css`：Tailwind 指令 + 自定义 glass 工具类 + 滚动淡入动画

### 页面组件
- `landing/src/components/NavBar.vue`：响应式导航栏 + 移动端汉堡菜单
- `landing/src/components/HeroSection.vue`：Hero 区标题/副标题/CTA + 主视觉悬浮动画
- `landing/src/components/FeatureCards.vue`：3 列核心功能卡片
- `landing/src/components/HowItWorks.vue`：3 步使用流程
- `landing/src/components/FAQSection.vue`：手风琴式 FAQ
- `landing/src/components/SiteFooter.vue`：Footer 链接与版权
- `landing/src/components/ScrollReveal.vue`：基于 IntersectionObserver 的滚动淡入包装组件

### 资源与部署
- 复用 `src/renderer/technical-support.png` 与 `src/renderer/graph.png` 到 `landing/src/assets/`
- 新增 `.github/workflows/deploy-landing.yml`：在 `landing/**` 改动时自动构建并部署到 GitHub Pages

## 新增/修改文件
- `landing/package.json`
- `landing/package-lock.json`
- `landing/vite.config.ts`
- `landing/tsconfig.json`
- `landing/tailwind.config.js`
- `landing/postcss.config.js`
- `landing/index.html`
- `landing/src/main.ts`
- `landing/src/App.vue`
- `landing/src/styles/tailwind.css`
- `landing/src/components/NavBar.vue`
- `landing/src/components/HeroSection.vue`
- `landing/src/components/FeatureCards.vue`
- `landing/src/components/HowItWorks.vue`
- `landing/src/components/FAQSection.vue`
- `landing/src/components/SiteFooter.vue`
- `landing/src/components/ScrollReveal.vue`
- `landing/src/assets/technical-support.png`
- `landing/src/assets/graph.png`
- `.github/workflows/deploy-landing.yml`
- `.vibe-harness/plans/landing-page.md`
- `.vibe-harness/history/landing-page.md`
- `.vibe-harness/index.md`

## 验证结果
- `cd landing && npm install` 成功
- `cd landing && npm run build` 成功，产物在 `landing/dist/`
- 构建后的 `index.html` 引用了正确的相对路径资源
- 响应式视觉检查需在浏览器 DevTools 中进一步验证（iPhone SE / iPad / Desktop）

## 已知限制 / 下一阶段
- 尚未在真实浏览器中做端到端视觉与交互验证
- 缺少真实产品截图，当前使用现有图标作为占位
- 若后续购买/配置自定义域名，需更新 GitHub Pages DNS 与 workflow
