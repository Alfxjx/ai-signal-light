# android-usage-tab-redesign

- 时间：2026-08-25
- 计划：[plans/android-usage-tab-redesign.md](../plans/android-usage-tab-redesign.md)

## 改动摘要

安卓端用量页 UI 改版：新增**双列网格 / 单列详情**切换（默认网格，偏好持久化），DeepSeek 余额放大显示，整体视觉精修。

## 文件改动

| 文件 | 改动 |
|------|------|
| `ui/components/UsageBar.kt` | 抽出 `usageBarColor(percent, warn, danger)` 公共颜色函数 |
| `ui/components/PaceBadge.kt` | **新增**：快/慢/均节奏徽章（红/蓝/灰底色小标签） |
| `ui/components/ConcentricRings.kt` | **新增**：Canvas 同心多环进度（外->内对应窗口顺序，颜色按阈值） |
| `ui/components/GridProviderCard.kt` | **新增**：网格模式 provider 卡（卡头+状态点、同心环中心显示最高窗口百分比、图例行=色点+窗口名+节奏徽章+百分比） |
| `ui/components/DeepseekBalance.kt` | **新增**：`DeepseekBalanceTile`（网格渐变 tile 大字余额）+ `DeepseekBalanceCard`（单列全宽渐变余额条）+ `deepseekSymbol`/`formatIsoTime` 公共函数 |
| `ui/components/ProviderCard.kt` | 单列详情卡精修：16dp 圆角、1dp elevation、节奏纯文字换 `PaceBadge` |
| `ui/home/UsageTab.kt` | **重构**：`ProviderUiModel` 统一渲染数据（复用原有 percent/pace/reset 计算逻辑）；顶部标题行+自绘切换图标；网格走 `LazyVerticalGrid(2列)`（DeepSeek tile 入格、加载/未配置/刷新按钮占满行），单列走原竖排；布局偏好存普通 SharedPreferences `ui_prefs/usage_grid` |

## 关键决策

- 布局偏好不入 `AppConfig`/`SecureConfigStore`（避免动桌面同步链路），用普通 SharedPreferences
- 切换图标自绘 Canvas（material-icons-core 无 GridView，避免引 icons-extended 大依赖）
- DeepSeek 渐变 tile（深蓝紫）深浅主题共用
- 网格模式短标题（火山引擎 Coding Plan -> 火山引擎），单列保留全名

## 影响范围

- 仅安卓端渲染层；数据链路（`HomeViewModel`、repository、WS 同步、通知）零改动
- `ProviderCard` 对外 API 不变（ClaudeTab 等不受影响）

## 验证

- `./gradlew assembleDebug` 编译通过（app-debug.apk 产出正常）
- 未验证：真机/模拟器运行效果（两种模式、深浅主题、error/no_token 状态），建议装机检查
