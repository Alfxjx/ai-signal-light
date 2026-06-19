# Android 版 Phase 1：项目骨架 + 用量显示

## 时间
2026-06-19

## 改动原因
用户希望把桌面端「AI 状态监控」扩展到原生 Android，第一版先实现与桌面端类似的模型用量查询功能，并建立可后续扩展扫码导入、桌面同步的项目骨架。

## 改动范围
- 新建完整 Android 项目：`android-app/`
- 技术栈：Kotlin + Jetpack Compose + Hilt + Ktor + WorkManager + EncryptedSharedPreferences
- 复刻桌面端 `src/main/usage-monitor.ts` 中 Kimi / MiniMax / Copilot 三个 API 的调用与解析逻辑
- 实现 `UsageRepository` + `UsagePollingWorker` 后台轮询
- 实现 `UsageTab` / `ProviderCard` / `UsageBar` 等 UI 组件，复刻桌面端阈值颜色
- 实现手动配置输入页面（Token、代理、轮询间隔、阈值）
- 配置使用 `EncryptedSharedPreferences` 安全存储
- 添加 Gradle wrapper，并配置腾讯云 Gradle 镜像（针对国内网络）

## 新增/修改文件

### Android 项目骨架
- `android-app/settings.gradle.kts`
- `android-app/build.gradle.kts`
- `android-app/gradle.properties`
- `android-app/gradle/libs.versions.toml`
- `android-app/app/build.gradle.kts`
- `android-app/app/proguard-rules.pro`
- `android-app/app/src/main/AndroidManifest.xml`
- `android-app/gradlew` / `gradlew.bat` / `gradle/wrapper/*`

### 资源
- `android-app/app/src/main/res/values/strings.xml`
- `android-app/app/src/main/res/values/colors.xml`
- `android-app/app/src/main/res/values/themes.xml`
- `android-app/app/src/main/res/xml/backup_rules.xml`
- `android-app/app/src/main/res/xml/data_extraction_rules.xml`
- `android-app/app/src/main/res/drawable/ic_launcher_*.xml`
- `android-app/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`

### Kotlin 源码
- `android-app/app/src/main/java/com/aisignallight/AiSignalLightApplication.kt`
- `android-app/app/src/main/java/com/aisignallight/MainActivity.kt`
- `android-app/app/src/main/java/com/aisignallight/di/DataModule.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/model/AppConfig.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/model/UsageData.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/utils/PercentUtils.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/repository/ConfigRepository.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/repository/UsageRepository.kt`
- `android-app/app/src/main/java/com/aisignallight/data/local/SecureConfigStore.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/KtorClientProvider.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/KimiApi.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/MinimaxApi.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/CopilotApi.kt`
- `android-app/app/src/main/java/com/aisignallight/data/repository/UsageRepositoryImpl.kt`
- `android-app/app/src/main/java/com/aisignallight/worker/UsagePollingWorker.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/theme/*`
- `android-app/app/src/main/java/com/aisignallight/ui/components/UsageBar.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/components/ProviderCard.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeScreen.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeViewModel.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/UsageTab.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsScreen.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsViewModel.kt`

### 测试
- `android-app/app/src/test/java/com/aisignallight/domain/utils/PercentUtilsTest.kt`

## 验证结果
- `./gradlew assembleDebug` 成功
- `./gradlew testDebugUnitTest` 成功

## 已知限制 / 下一阶段
- ✅ Phase 2 已实现二维码扫码导入配置（见 `android-phase2-qr-pairing.md`）
- 尚未实现 Claude 项目状态同步（Phase 3，依赖桌面端 LAN 模式改造）
- Room 数据库已依赖声明但尚未深度使用，将在项目同步/缓存阶段接入
