# android-usage-tab-redesign

## 目标

安卓端用量页（Usage tab）UI 改版：

1. 支持**双列网格 / 单列详情**两种模式，可切换，选择持久化（默认网格）
2. DeepSeek 余额**放大显示**：网格模式为渐变 tile 大数字；单列模式为全宽渐变余额条
3. 整体更精美：卡片圆角化、节奏（快/慢/均）徽章化、网格卡用同心多环展示多窗口

## 设计决策（与用户确认过的 mockup）

- 网格模式：一家一卡；卡头 provider 名 + 状态点；中间同心多环（环在上、图例在下，外圈->内圈 = 图例从上到下顺序），环颜色按用量阈值（绿/黄/红），环中心显示用量最高窗口的百分比；图例行 = 色点 + 窗口名 + 节奏徽章 + 百分比
- 单列模式：保留现有全部信息（进度条、Reset in、节奏、状态、最后更新），样式精修
- 切换按钮放在用量页顶部标题行右侧；布局偏好存普通 SharedPreferences（非敏感，不入加密存储，避免动 AppConfig 同步链路）

## 文件改动

| 文件 | 改动 |
|------|------|
| `ui/components/UsageBar.kt` | 抽出 `usageBarColor(percent, warn, danger)` 公共颜色函数，UsageBar 复用 |
| `ui/components/PaceBadge.kt` | 新增：快/慢/均 徽章 composable |
| `ui/components/ConcentricRings.kt` | 新增：Canvas 绘制同心环，入参 `List<UsageRing>` |
| `ui/components/GridProviderCard.kt` | 新增：网格模式 provider 卡（环 + 图例），复用 `UsageBarItem` |
| `ui/components/DeepseekBalance.kt` | 新增：`DeepseekBalanceTile`（网格）+ `DeepseekBalanceCard`（单列）+ 币种符号/formatIsoTime 公共函数 |
| `ui/components/ProviderCard.kt` | 单列详情卡精修：16dp 圆角、节奏徽章替换纯文字 |
| `ui/home/UsageTab.kt` | 重构：`ProviderUiModel` 列表（复用现有 bars/pace/reset 计算逻辑），按模式渲染 `LazyVerticalGrid(2列)` 或竖排 Column；顶部标题行 + 切换按钮（自绘图标，material-icons-core 无 GridView）；`ui_prefs` SharedPreferences 持久化 `usage_grid` |

## 数据/逻辑不变的部分

- 所有 provider 的 percent/pace/reset/状态计算逻辑原样保留，只是渲染层换
- `AppConfig`、`SecureConfigStore`、WS 同步、通知链路均不动

## 验证

- `cd android-app && ./gradlew assembleDebug` 编译通过
- 人工检查：两种模式、深/浅主题、error / no_token / 加载中状态
