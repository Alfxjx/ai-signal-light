# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
