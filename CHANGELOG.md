# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [2.3.0](https://github.com/Alfxjx/ai-signal-light/compare/v2.2.0...v2.3.0) (2026-08-25)


### ✨ 新功能

* 火山请求成功后自动从 Set-Cookie 刷新 csrfToken 并回写配置（Electron+Android） ([c7625c5](https://github.com/Alfxjx/ai-signal-light/commit/c7625c593bf9222a0644def925fb3d08064c3f76))
* 火山引擎用量卡新增 weekly/monthly 消耗节奏(慢平快) ([c9ec490](https://github.com/Alfxjx/ai-signal-light/commit/c9ec490a7420725ddef1c709a3096f5273e30604))
* 火山用量卡 session(5h)/monthly(30d) 补齐消耗节奏 ([8c64c6a](https://github.com/Alfxjx/ai-signal-light/commit/8c64c6a609807a170e90e814ec693e8e9ded2884))
* 接入deepseek 方舟 ([7fffa2b](https://github.com/Alfxjx/ai-signal-light/commit/7fffa2bcfee6ea3a050f07a65b8a13e716cd090e))
* Android 端 kimi/minimax 用量卡也显示消耗节奏(慢平快) ([d3efb4a](https://github.com/Alfxjx/ai-signal-light/commit/d3efb4add26977daf9f29c46f04ebb1f0f8d8d14))
* Android 端火山引擎用量卡新增消耗节奏(慢平快)与单测 ([3090b48](https://github.com/Alfxjx/ai-signal-light/commit/3090b48b79e45f7ca8ed37a270e40fba18b924f0))
* Android 端新增 DeepSeek 余额查询 + 扫码同步纳入 deepseek ([344cf8e](https://github.com/Alfxjx/ai-signal-light/commit/344cf8e87dd8bb265354043d2939ab284565bc41))
* Android 端新增火山引擎 Coding Plan 用量监控 ([d1c0463](https://github.com/Alfxjx/ai-signal-light/commit/d1c0463858386ff1c8572cdc3b26342c067dc872))
* Android Usage 卡片显示各窗口 Reset in XdYhZm 重置时间 ([377ef5a](https://github.com/Alfxjx/ai-signal-light/commit/377ef5a05d3edce3663a7b8e8dab5eb6cb779e5c))
* Android Usage 页只渲染启用中的 provider 卡片，禁用不再显示 ([606eeea](https://github.com/Alfxjx/ai-signal-light/commit/606eeea78f700c8d4b4d7f9f6d2734b662e87175))
* Electron 端新增火山引擎 Coding Plan 用量监控 ([0036d52](https://github.com/Alfxjx/ai-signal-light/commit/0036d52188659ab74e645491b5f4750d1750110c))


### 🐛 修复

* 火山引擎 200 带 ResponseMetadata.Error 时给出明确的 CSRF/登录过期提示 ([b411a8a](https://github.com/Alfxjx/ai-signal-light/commit/b411a8aa165b3b3c51b5ab88c0bee77299b9b779))
* 内置 DigiCert 证书链信任锚点解决安卓 CertPath 校验失败 ([f13ac0e](https://github.com/Alfxjx/ai-signal-light/commit/f13ac0ecc05ce30393bb5750dbf9bf8d7af6d8d4))
* Android 火山引擎识别 200 返回的 ResponseMetadata.Error ([0a8cb7a](https://github.com/Alfxjx/ai-signal-light/commit/0a8cb7a3dd1e45e9013a70a6cef0872dd4a90979))


### 📝 文档

* 火山引擎 Ark Coding Plan 用量监控设计文档 ([8ab11dc](https://github.com/Alfxjx/ai-signal-light/commit/8ab11dc7e229b0cea325db051228005aeb298e40))
* 火山引擎 Coding Plan 用量监控实施计划（Electron + Android） ([6cae891](https://github.com/Alfxjx/ai-signal-light/commit/6cae8916a24047474dc6bc4e434b3272d30b7d20))

## [2.2.0](https://github.com/Alfxjx/ai-signal-light/compare/v2.1.2...v2.2.0) (2026-07-22)


### ✨ 新功能

* add usage pace indicator to UsageCard for 5h/week limits ([4effc6c](https://github.com/Alfxjx/ai-signal-light/commit/4effc6cc0c33225e210a71783bf1c02de1c3dc06))


### 📝 文档

* **harness:** update tray-hover-above-icon history for v2.1.2 manual refresh button ([ac5c663](https://github.com/Alfxjx/ai-signal-light/commit/ac5c66339c8b2888f011560db0398a257fdb82a4))

## [2.1.2](https://github.com/Alfxjx/ai-signal-light/compare/v2.1.1...v2.1.2) (2026-07-21)


### ✨ 新功能

* 托盘 hover 弹窗改为手动刷新用量数据 ([e8f73b6](https://github.com/Alfxjx/ai-signal-light/commit/e8f73b6917a95c9444f6ed0e8e59cb431c027cc3))


### 📝 文档

* **harness:** update tray-hover-above-icon history with refresh and release notes ([7cb1bb1](https://github.com/Alfxjx/ai-signal-light/commit/7cb1bb1dccf3c8f9c2b74d8697a0a02726ae7fcf))

## [2.1.1](https://github.com/Alfxjx/ai-signal-light/compare/v2.1.0...v2.1.1) (2026-07-21)

## [2.1.0](https://github.com/Alfxjx/ai-signal-light/compare/v2.0.0...v2.1.0) (2026-07-21)


### ✨ 新功能

* 添加浮层速览栏 ([393c5af](https://github.com/Alfxjx/ai-signal-light/commit/393c5af065ea4831cc5f01a779130d34a164bc23))

## [2.0.0](https://github.com/Alfxjx/ai-signal-light/compare/v1.4.1...v2.0.0) (2026-07-20)

## [1.4.0](https://github.com/Alfxjx/ai-signal-light/compare/v1.3.0...v1.4.0) (2026-06-24)


### ✨ 新功能

* add responsive marketing landing page with GitHub Pages deployment ([2d8026a](https://github.com/Alfxjx/ai-signal-light/commit/2d8026a56f4e44b1b5233e26d1d5fa66309d683c))
* make UsageRepository.refresh return snapshot for notification worker ([1e6d60f](https://github.com/Alfxjx/ai-signal-light/commit/1e6d60f544f41b558f551ca3ba953f43daed2f4c))
* Phase 2 - desktop LAN mode, QR pairing, and Android QR scan import ([2f953da](https://github.com/Alfxjx/ai-signal-light/commit/2f953daad2c59e70944702538117eeb3f67ddf9c))
* Phase 3 - Android LAN WebSocket sync for Claude project status ([37919a4](https://github.com/Alfxjx/ai-signal-light/commit/37919a467809c5b2134f71a6c87f3edf715b5a09))
* Phase 4 - Android threshold notifications, sync status, and lifecycle optimization ([de2cdd2](https://github.com/Alfxjx/ai-signal-light/commit/de2cdd2c40a7c3c06198f049693b4304217d8fe1))


### 🐛 修复

* 修复二维码太大导致的不显示问题 ([84e4737](https://github.com/Alfxjx/ai-signal-light/commit/84e47376c1b3a6d683eedb02043587ab0c9d4b60))
* 悬浮球样式优化 ([41ff17f](https://github.com/Alfxjx/ai-signal-light/commit/41ff17fddbe054c798eac80a6d4b1f3efa993aa1))

## [1.3.0](https://github.com/Alfxjx/ai-signal-light/compare/v1.2.0...v1.3.0) (2026-06-18)


### ✨ 新功能

* add missing shared files to electron-builder configuration and document the fix ([bd7db32](https://github.com/Alfxjx/ai-signal-light/commit/bd7db32593de1908a0f41963c4a7df99536a5464))

## [1.2.0](https://github.com/Alfxjx/ai-signal-light/compare/v1.1.0...v1.2.0) (2026-06-18)


### ✨ 新功能

* make usage bar thresholds configurable and unify usage percentage semantics ([012f685](https://github.com/Alfxjx/ai-signal-light/commit/012f685ac6e8e4650f4f05c04a53f04c45ae26e6))
* refactor usage state and improve WebSocket handling with shared constants ([87a4849](https://github.com/Alfxjx/ai-signal-light/commit/87a484972d51d5bb3be2c0aa1e5eb89f1cc453f9))

## 1.1.0 (2026-06-16)


### ✨ 新功能

* 添加缩略浮窗功能 ([67ffc9f](https://github.com/Alfxjx/ai-signal-light/commit/67ffc9fd8e3c72899deb19784c93074032da5587))
* add Claude Code hooks functionality and settings ([37d6e4f](https://github.com/Alfxjx/ai-signal-light/commit/37d6e4fa2b1c5ac64b4ce782aaf48bca2100bfe1))
* add Copilot support with configuration and usage tracking ([3619eb2](https://github.com/Alfxjx/ai-signal-light/commit/3619eb2a9d353a24d27aba5215511fb7d168ccac))
* mvp version ([47bce8f](https://github.com/Alfxjx/ai-signal-light/commit/47bce8f211d9c96f51e535460f262594aa47e0f2))
* **window:** persist size/position/compact across restarts, multi-monitor aware ([1bdea24](https://github.com/Alfxjx/ai-signal-light/commit/1bdea24b567b440a82c373fffc1208906168a223))


### 🐛 修复

* 修复迁移的问题 ([f4a68ff](https://github.com/Alfxjx/ai-signal-light/commit/f4a68ff8c7a4f248f13a3cec33acdfed3b7398db))
* **floating-ball:** temporarily hide pending project status ([09e5b73](https://github.com/Alfxjx/ai-signal-light/commit/09e5b73213eb8002a40f6879d0236fed3b8136b1))
* minimax display bug ([3acade2](https://github.com/Alfxjx/ai-signal-light/commit/3acade28eb0fd325afdf5fe183d7b20c46090bd0))
* **renderer:** parse ISO lastUpdate & switch usage status to colored dot ([9186073](https://github.com/Alfxjx/ai-signal-light/commit/91860738c18563a305e997f33f1fc3fab35aeeca))
* wip ([1b3fbe6](https://github.com/Alfxjx/ai-signal-light/commit/1b3fbe645640949a45476bbd6b95eb7b1b569070))


### 📝 文档

* add release automation design spec ([a8a5a82](https://github.com/Alfxjx/ai-signal-light/commit/a8a5a82a782e19a3397b19fffa647f65bc230700))
* add release automation implementation plan ([40de7a9](https://github.com/Alfxjx/ai-signal-light/commit/40de7a9d1480a0fa4c45b9424123e8a148975c24))
* **agents:** document release commands ([605ba8c](https://github.com/Alfxjx/ai-signal-light/commit/605ba8cf922cd12998235c34452ba262b88c235c))


### ♻️ 重构

* 升级到ts ([0902852](https://github.com/Alfxjx/ai-signal-light/commit/0902852df01402804ef3b6d1fe0bed1c0da0edd3))
* **renderer:** migrate to Vue 3 SFC + TypeScript + Vite ([4ee207d](https://github.com/Alfxjx/ai-signal-light/commit/4ee207d0cff1de825c90e026f64b3c587af5e0dd))
