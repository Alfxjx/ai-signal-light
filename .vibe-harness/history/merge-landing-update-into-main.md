# 合并 landing-update 到 main

- 时间：2026-10-09
- 计划：[plans/merge-landing-update-into-main.md](../plans/merge-landing-update-into-main.md)
- 来源：`git merge --no-commit --no-ff origin/landing-update`，21 个冲突全部手工解决

## 背景

远端三分支从 `2.6.0 (ee927dd)` 各自演进：`main` 拿到安卓重构与火山官方签名，`opencode-feat`
拿到 opencode 插件与配置助手 CLI，`landing-update` 在 `opencode-feat` 之上再加 landing 重做
与侧边栏刷新按钮。`landing-update` 含 `opencode-feat` 全部提交，故只合它一次。

## 冲突处理原则

**火山引擎一律取 main。** 两边各自重做过：main 的 `49fde9f`（2026-10-09）明确"彻底删除
Cookie / x-csrf-token 通道"，比分支侧的"AK/SK 优先 + Cookie 回退"更晚且是显式决策。
由此删除：`fetchVolcengineByCookie` / `syncVolcengineCookies` / `VOLCENGINE_API`（控制台网关）/
`parseCookieJar` / `mergeCookiePair`（连同 `usage-monitor.test.ts` 里对应 6 个用例）。

**MiMo 一律保留。** 分支侧新增 provider，main 没有，合并后必须留下。

**安卓 UI 取 main，MiMo 手工移植。** 这两处不能二选一，是本次合并唯一需要新写代码的地方。

## 逐文件决策

| 文件 | 处理 |
|---|---|
| `src/shared/types/config.ts` | 取 main（`VolcengineProviderConfig` 只剩 AK/SK；`MobileAppConfig` 删 `volcengine`） |
| `src/shared/types/ipc.ts` | 取 main + 保留 feat 的 `hasMimoCookie` |
| `src/main/config.ts` | 取 main 的"显式挑键"迁移逻辑（防止旧 config.json 的 cookie 进内存）+ feat 的 `mimo` 默认值/迁移 |
| `src/main/pairing.ts` | 取 main（`toMobileConfig` 去 volcengine 投影） |
| `src/main/usage-monitor.ts` | 取 main 的火山实现（`fetchVolcengineByAksk` + `VOLCENGINE_OPEN_*`），保留 feat 的 `fetchMimo` + `MIMO_BALANCE_API` |
| `src/main/usage-monitor.test.ts` | 取 feat 的 `ResetTime` 兼容用例（断言更严），删掉 cookie jar 的 6 个用例与对应 import |
| `src/main/main.ts` | 取 main 的 volcengine 掩码/`keepOrTake`，保留 feat 的 `mimo` 掩码与 `SETTINGS_SAVE` 的 mimo 分支 |
| `src/renderer/src/Settings.vue` | 取 main 的 AK/SK 表单，删 Cookie/x-csrf 字段与回退文案；保留 feat 的小米 MiMo 整节 |
| `android-app/.../VolcengineApi.kt` | **整体取 main**——feat 侧该文件只有 Cookie 通道（`fetchByCookie` / `syncCookies` / `ConfigRepository` 注入），无独占新增 |
| `android-app/.../AppConfig.kt` | 取 main（去掉 `cookie` / `csrfToken` 字段） |
| `android-app/.../UsageData.kt` | 保留 feat 的 `MimoUsageData` + `BalanceData`，并给 `MimoUsageData` 补 `@Serializable`（`UsageSnapshot.mimo` 要序列化，feat 侧漏了），`UsageProviderState<out T>` 的协变放宽也保留 |
| `android-app/.../UsageRepositoryImpl.kt` | 取 main（只认 AK/SK），MiMo 的 fetch 分支由 feat 自动合入 |
| `android-app/.../ui/scan/ScanViewModel.kt` | **保持 main 的删除**（安卓已不扫码），feat 侧该文件是扫码配对时代的产物 |
| `android-app/.../ui/components/BalanceCard.kt` | 取 feat 的泛化版（`BalanceTile` / `BalanceCard` 共用 `BalanceData`），回补 main 的 `onClick` 与 `deepseekSymbol` 命名（`UsageWidget.kt` 依赖它）、`not_configured_open_settings` 文案（`error_no_token` 字符串不存在） |
| `android-app/.../ui/home/UsageTab.kt` | **取 main**（2026-10-07 单屏重设计），手工补 MiMo 余额行；`allEmpty` 加上 mimo |
| `android-app/.../ui/settings/SettingsScreen.kt` / `SettingsViewModel.kt` | **取 main**（Material3 ListItem 重构），手工把 `SettingsProvider.MIMO` 补进 enum、`updateProviderEnabled`/`updateProviderToken` 与 5 个扩展函数；MiMo 的 token label 覆盖为"控制台 Cookie" |
| `AGENTS.md` | 目录树与 Usage quotas 条目两边合并：火山取 main 的描述 + 补 MiMo；QR pairing 条目保留 main 的"已无安卓消费端" |
| `.vibe-harness/index.md` | 两边条目都留，按时间倒序排列 |
| `.vibe-harness/{plans,history}/volcengine-aksk.md` | **取 main 版**——两边同名文件记录的是同一件事的不同分支版本，main 版记录的是当前仓库里实际落地的改动 |

## 验证

- `npm run typecheck`（`vue-tsc` + `tsc -p tsconfig.main.json`）通过
- `android-app/gradlew assembleDebug` BUILD SUCCESSFUL
- `npm test`：12 个文件中 10 通过；`pet-store.test.ts` / `pet-install.test.ts` 共 3 例失败。
  **这 3 例在 `origin/landing-update` 上原样复现**（临时 worktree 跑过对照），与本次合并无关：
  - 2 例是 `CompressionStream('deflate-raw')`，需 Node ≥ 22，本机是 v20.11.1
  - 1 例 `PetStore > 按安装时间正序` 是同毫秒时间戳的排序并列，测试自身的不稳定

## 影响范围

- 桌面端新增：桌面宠物窗口、悬浮球 Kimi NotifyUser 气泡、MiMo 余额 provider
- 安卓端新增：MiMo 余额 provider（设置页 + 首页余额卡 + 仓库取数）
- 仓库新增目录：`opencode-plugin/`、`opencode-usage-plugin-helper-cli/`（各自独立 package.json 与 vitest，`npm test` 不覆盖）
- landing 整页重做 + README 刷新
- 未变：火山 AK/SK 通道、安卓单屏重构、桌面宠物之外的其它 main 侧功能

## 后续可做

- `opencode-plugin` 与 `opencode-usage-plugin-helper-cli` 的依赖尚未 `npm install`，要用需先各自装依赖
- `pet-install.test.ts` 的 2 例要跑通需把 Node 升到 ≥ 22