# Android 版 Phase 3：LAN WebSocket 同步 Claude 项目状态

## 时间
2026-06-19

## 改动原因
Phase 2 已实现配置导入，Phase 3 需要让手机端通过 LAN WebSocket 接收桌面端 `StatusServer` 推送的 Claude Code 项目运行状态和 Hook 待处理通知，并在 Android 端展示、缓存、离线可用。

## 改动范围

### Android 端
- `android-app/gradle/libs.versions.toml`
  - 新增 `ktor-client-websockets`
- `android-app/app/build.gradle.kts`
  - 接入 Ktor WebSocket 插件
- 新增领域模型
  - `domain/model/ProjectSync.kt`：`ClaudeProject`、`AssistantStatus`、`DetectorDetails`、`PendingHook`、`ProjectSyncState`、`ProjectWithAssistant`
  - `domain/model/ClaudeHookPayload.kt`：解析桌面 hook 事件
  - `domain/model/SyncEvent.kt`：`Init`、`StatusChange`、`PendingChanged`、`ClaudeHook`
  - `domain/model/TimestampSerializers.kt`：把桌面 ISO/字符串/数字时间统一转为 epoch 毫秒
  - `domain/utils/TimeUtils.kt`：相对时间与年龄级别（<5min 绿 / <1h 黄 / 更久灰）
- Room 本地缓存
  - `data/local/SyncEntities.kt`：`ProjectEntity`、`PendingEntity`
  - `data/local/SyncDao.kt`：`ProjectDao`、`PendingDao`
  - `data/local/AppDatabase.kt`：Room 数据库
- 远程同步
  - `data/remote/DesktopSyncClient.kt`
    - 使用 Ktor + OkHttp 引擎连接 `ws://<host>:<port>`
    - WebSocket upgrade 携带 `Authorization: Bearer <apiKey>`
    - 解析 `init` / `statusChange` / `pendingChanged` / `claudeHook`
    - 自动重连与指数退避
- 仓库层
  - `domain/repository/ProjectSyncRepository.kt`（新增接口）
  - `domain/repository/ConnectionState.kt`
  - `data/repository/ProjectSyncRepositoryImpl.kt`：把消息持久化到 Room，对外暴露 Flow
- DI
  - `di/DataModule.kt`：提供 Room Database / DAO，绑定 `ProjectSyncRepository`
- UI
  - `ui/home/HomeViewModel.kt`：连接桌面同步，组合用量 + 项目同步状态
  - `ui/home/HomeScreen.kt`：底部导航切换「用量」与「Claude」标签
  - `ui/home/ClaudeTab.kt`：项目列表、相对时间、年龄颜色、待处理红点、时间范围筛选、连接状态

## 新增/修改文件
- `android-app/gradle/libs.versions.toml`
- `android-app/app/build.gradle.kts`
- `android-app/app/src/main/java/com/aisignallight/domain/model/ProjectSync.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/model/ClaudeHookPayload.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/model/SyncEvent.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/model/TimestampSerializers.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/utils/TimeUtils.kt`
- `android-app/app/src/main/java/com/aisignallight/data/local/SyncEntities.kt`
- `android-app/app/src/main/java/com/aisignallight/data/local/SyncDao.kt`
- `android-app/app/src/main/java/com/aisignallight/data/local/AppDatabase.kt`
- `android-app/app/src/main/java/com/aisignallight/data/remote/DesktopSyncClient.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/repository/ProjectSyncRepository.kt`
- `android-app/app/src/main/java/com/aisignallight/domain/repository/ConnectionState.kt`
- `android-app/app/src/main/java/com/aisignallight/data/repository/ProjectSyncRepositoryImpl.kt`
- `android-app/app/src/main/java/com/aisignallight/di/DataModule.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeViewModel.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/HomeScreen.kt`
- `android-app/app/src/main/java/com/aisignallight/ui/home/ClaudeTab.kt`

## 验证结果
- `./gradlew assembleDebug` 成功
- `./gradlew testDebugUnitTest` 成功

## 已知限制 / 下一阶段
- 尚未在真机/模拟器上做端到端验证（桌面生成二维码 → 手机扫码 → Claude 项目同步）
- 当前连接生命周期跟随 `HomeViewModel`；切出应用会断开，后台仅保留 WorkManager 用量轮询
- 云端中继同步列为 Phase 5 可选增强
