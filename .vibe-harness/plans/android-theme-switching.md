# Android 主题切换与跟随系统暗色模式

## Context

当前 Android App 的 `MainActivity` 固定使用浅色 MaterialTheme，用户无法切换主题，也不能跟随系统暗色模式。需要在设置中提供「浅色 / 深色 / 跟随系统」选项，并持久化用户选择。

## User Decisions

| 决策项 | 用户选择 |
|--------|----------|
| 目标平台 | Android App |
| 主题选项 | 浅色、深色、跟随系统 |
| 默认选项 | 跟随系统 |

## Recommended Approach

### 1. 数据模型

在 `domain/model/AppConfig.kt` 中新增可序列化的 `ThemeMode` 枚举：

```kotlin
@Serializable
enum class ThemeMode { LIGHT, DARK, SYSTEM }
```

并给 `AppConfig` 增加 `val themeMode: ThemeMode = ThemeMode.SYSTEM`。

旧配置中没有该字段，由于 Json 设置了 `ignoreUnknownKeys = true` 且数据类有默认值，升级后会自动回退到 `SYSTEM`。

### 2. 配置仓库

`domain/repository/ConfigRepository.kt` 增加：

```kotlin
suspend fun saveThemeMode(mode: ThemeMode)
```

`data/local/SecureConfigStore.kt` 实现：读取当前配置，复制更新 `themeMode`，调用现有 `saveConfig()`，`_configFlow` 会自动刷新。

### 3. 主题配置

`ui/theme/Theme.kt` 中 `AISignalLightTheme` 改为接收 `ThemeMode`：

```kotlin
@Composable
fun AISignalLightTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    content: @Composable () -> Unit
) {
    val darkTheme = when (themeMode) {
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = Typography,
        content = content
    )
}
```

保留现有 `LightColors` / `DarkColors`；后续可再按品牌色微调。

### 4. Activity 接线

`MainActivity.kt`：
- 注入 `ConfigRepository`
- 用 `collectAsStateWithLifecycle(initialValue = AppConfig())` 监听配置
- 将 `config.themeMode` 传入 `AISignalLightTheme`
- `AndroidManifest.xml` 中 `MainActivity` 增加 `android:configChanges="uiMode|orientation|screenSize"`，避免系统切换暗色时重建 Activity；Compose 会自动重绘。

### 5. 设置界面

`ui/settings/SettingsScreen.kt` 新增主题选择区，使用 Material3 `SingleChoiceSegmentedButtonRow`：

- 浅色
- 深色
- 跟随系统

选择后立即通过 `SettingsViewModel.updateTheme(mode)` 保存，用户无需再点「保存」按钮。

`SettingsViewModel.kt`：
- `SettingsUiState` 增加 `themeMode`
- `init` 从配置读取当前主题
- 增加 `updateTheme(mode)`：更新 UI 状态并调用 `configRepository.saveThemeMode(mode)`
- `save()` 构造 `AppConfig` 时带上 `themeMode`

### 6. 主题与 Edge-to-Edge

`res/values/themes.xml` 父主题改为 `android:Theme.Material.Light.NoActionBar`，移除硬编码 `statusBarColor`。

新增 `res/values-night/themes.xml`：

```xml
<style name="Theme.AISignalLight" parent="android:Theme.Material.NoActionBar">
</style>
```

与 `enableEdgeToEdge()` 配合，减少启动时主题闪烁。

## Critical Files to Modify / Create

- `android-app/app/src/main/java/com/aisignallight/domain/model/AppConfig.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/repository/ConfigRepository.kt`
- `android-app/app/src/main/java/com/aisignallight/data/local/SecureConfigStore.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/theme/Theme.kt`
- `android-app/app/src/main/java/com/aisignallight/MainActivity.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsViewModel.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsScreen.kt`
- `android-app/app/src/main/AndroidManifest.xml`
- `android-app/app/src/main/res/values/themes.xml`
- `android-app/app/src/main/res/values-night/themes.xml`

## Verification

1. 首次安装启动：主题为系统当前模式。
2. 系统切换暗色/浅色：App 自动切换（Follow System）。
3. 设置中选择「深色」：立即变暗，杀进程重启后仍保持深色。
4. 设置中选择「浅色」：立即变亮，旋转屏幕不变。
5. `./gradlew assembleDebug` 成功。
6. 视觉回归：检查 `HomeScreen` 连接横幅、`UsageBar`、`ProviderCard` 在深浅色下可读。

## Risks & Mitigation

| 风险 | 缓解措施 |
|------|----------|
| 旧配置无 themeMode 字段崩溃 | 依赖 `ignoreUnknownKeys` 与默认值 |
| Activity 重建导致切换闪烁 | 添加 `configChanges="uiMode"` |
| 某些组件硬编码颜色导致暗色下看不清 | 检查并改用 `MaterialTheme.colorScheme` |
| SegmentedButton 需要 Material3 依赖 | 项目已使用 Material3 |
