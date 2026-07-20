# Android 主题切换与跟随系统暗色模式

## 时间
2026-06-28

## 改动原因
Android App 此前固定使用浅色主题，在暗色系统环境下不够舒适。新增「浅色 / 深色 / 跟随系统」选项，并持久化用户偏好。

## 改动范围

### 数据与配置
- `domain/model/AppConfig.kt`
  - 新增 `ThemeMode` 枚举（`LIGHT`、`DARK`、`SYSTEM`）
  - `AppConfig` 增加 `themeMode` 字段，默认 `SYSTEM`
- `domain/repository/ConfigRepository.kt`
  - 新增 `saveThemeMode(mode)` 接口
- `data/local/SecureConfigStore.kt`
  - 实现 `saveThemeMode`：读取当前配置、更新字段、保存并刷新 Flow

### 主题与 UI
- `ui/theme/Theme.kt`
  - `AISignalLightTheme` 改为接收 `ThemeMode`，根据 `isSystemInDarkTheme()` 解析最终是否使用暗色
- `MainActivity.kt`
  - 注入 `ConfigRepository`，用 `collectAsStateWithLifecycle` 监听配置并传入主题模式
- `ui/settings/SettingsViewModel.kt`
  - `SettingsUiState` 增加 `themeMode`
  - 初始化时读取配置中的主题
  - 新增 `updateTheme(mode)` 立即保存
  - `save()` 构造 `AppConfig` 时带上主题
- `ui/settings/SettingsScreen.kt`
  - 新增 `ThemeSelector` 组件，使用 `SingleChoiceSegmentedButtonRow`
  - 在设置页顶部加入主题选择区

### 系统主题适配
- `AndroidManifest.xml`
  - `MainActivity` 增加 `android:configChanges="uiMode|orientation|screenSize|smallestScreenSize"`，避免系统切换暗色时重建 Activity
- `res/values/themes.xml`
  - 父主题改为 `android:Theme.Material.Light.NoActionBar`，移除硬编码 `statusBarColor`
- `res/values-night/themes.xml`（新增）
  - 父主题为 `android:Theme.Material.NoActionBar`

## 新增/修改文件
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
- `.vibe-harness/plans/android-theme-switching.md`
- `.vibe-harness/history/android-theme-switching.md`
- `.vibe-harness/index.md`

## 验证结果
- `./gradlew assembleDebug` 成功
- `./gradlew testDebugUnitTest` 成功
- 真机/模拟器上的深浅色切换、持久化、跟随系统行为需进一步验证

## 已知限制 / 下一阶段
- 当前 `LightColors` / `DarkColors` 仍是基准 Material3 配色，后续可按品牌色（深色玻璃拟态 + 绿色强调）进一步微调。
- 部分自定义组件（如连接状态横幅）在暗色下需要目视检查对比度。
