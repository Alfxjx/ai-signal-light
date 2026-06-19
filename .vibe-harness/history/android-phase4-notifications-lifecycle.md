# Android 版 Phase 4：阈值通知、连接状态、后台优化

## 时间
2026-06-19

## 改动原因
Phase 3 已实现 LAN WebSocket 同步，Phase 4 需要：
1. 当模型用量超过 warn/danger 阈值时主动通知用户。
2. 在首页展示桌面同步连接状态与最后同步时间，连接断开时给出中文错误提示。
3. 让 WebSocket 仅在应用前台保持，后台完全交给 WorkManager 轮询，降低电量消耗。

## 改动范围

### Android 端
- 依赖
  - `android-app/gradle/libs.versions.toml`：新增 `androidx-lifecycle-process`
  - `android-app/app/build.gradle.kts`：接入 `lifecycle-process`
- 通知
  - 新增 `data/notification/NotificationHelper.kt`：创建通知渠道、解析用量快照、触发阈值通知
  - `worker/UsagePollingWorker.kt`：每次轮询后调用 `NotificationHelper.checkAndNotify()`
  - `AndroidManifest.xml`：补充 `POST_NOTIFICATIONS` 权限
  - `AiSignalLightApplication.kt`：应用启动时创建通知渠道
- 前台/后台生命周期
  - 新增 `lifecycle/AppLifecycleObserver.kt`：基于 `ProcessLifecycleOwner`，应用切到前台自动连接 WebSocket，切到后台自动断开
  - `AiSignalLightApplication.kt`：启动 `AppLifecycleObserver`
  - `HomeViewModel.kt`：移除显式的 connect/disconnect，由生命周期观察者统一管理
- 连接状态展示
  - `data/remote/DesktopSyncClient.kt`：新增 `classifyError()`，把网络/鉴权/超时异常转换为用户友好的中文提示
  - `ui/home/HomeScreen.kt`：
    - 增加连接状态横幅（已连接/错误/离线）
    - 显示最后同步时间
    - 进入首页时请求 `POST_NOTIFICATIONS` 权限（Android 13+）
  - `res/values/strings.xml`：新增连接状态相关文案

## 新增/修改文件
- `android-app/gradle/libs.versions.toml`
- `android-app/app/build.gradle.kts`
- `android-app/app/src/main/AndroidManifest.xml`
- `android-app/app/src/main/java/com/aisignallight/AiSignalLightApplication.kt`
- `android-app/app/src/main/java/com/aisignallight/data/notification/NotificationHelper.kt`
- `android-app/app/src/main/java/com/aisignallight/lifecycle/AppLifecycleObserver.kt`
- `android-app/app/src/main/java/com/aisignallight/worker/UsagePollingWorker.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeViewModel.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeScreen.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/DesktopSyncClient.kt`
- `android-app/app/src/main/res/values/strings.xml`

## 验证结果
- `./gradlew assembleDebug` 成功
- `./gradlew testDebugUnitTest` 成功

## 已知限制 / 下一阶段
- 尚未在真机/模拟器上做端到端验证（阈值通知触发、前台/后台切换重连）
- 通知权限被拒绝时仅显示静态提示，未提供再次引导入口
- 云端中继、桌面小部件等列为 Phase 5 可选增强
