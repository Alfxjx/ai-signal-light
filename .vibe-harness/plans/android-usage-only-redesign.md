# Android App 重构：专注用量监控 + 简化设置 + 下拉刷新 + 桌面小组件

## 目标

把安卓 APP 收敛为**单一用量监控工具**：
1. 首页只有用量页（列表卡片），移除 Claude 项目标签页、底部导航、扫码/桌面同步全部代码
2. 设置页重构为 Material3 标准分组列表 + 逐项即时保存（去掉底部"保存"按钮和超长滚动表单）
3. 刷新改为下拉刷新（Material3 `PullToRefreshBox`，BOM 2024.12.01 已自带，无新依赖）
4. 新增 Glance 桌面小组件，展示各服务商用量进度条 + 更新时间

已确认的取舍：**完全移除扫码导入**；**只保留列表卡片布局**（删除网格/列表切换）。

---

## 一、删除清单（Claude 项目同步 + 扫码/桌面同步）

删除文件：
- `ui/home/ClaudeTab.kt`、`ui/home/HomeScreen.kt` 中的 `HomeTab`/底部 `NavigationBar`/`ConnectionBanner`（HomeScreen 重写，见下）
- `ui/scan/` 整个目录（ScanScreen、ScanViewModel）
- `domain/repository/ProjectSyncRepository.kt`、`data/repository/ProjectSyncRepositoryImpl.kt`
- `data/remote/DesktopSyncClient.kt`、`data/remote/KtorClientProvider.kt` 中仅 WS 用到的部分（Ktor http client 保留）
- `domain/model/ProjectSync.kt`、`SyncEvent.kt`、`ClaudeHookPayload.kt`、`domain/utils/TimeUtils.kt`（如仅项目同步使用）
- Room：`SyncEntities.kt` 中 `ProjectEntity`/`PendingEntity`、`SyncDao.kt`、`AppDatabase.kt` 升版本 + `fallbackToDestructiveMigration()`（缓存数据可丢弃）
- `lifecycle/AppLifecycleObserver.kt`（WS 生命周期，随 DesktopSyncClient 一起删）及 `AiSignalLightApplication.kt` 中的注册
- `MainActivity.kt` 中 `scan` 路由
- `SecureConfigStore` 中桌面连接字段（host/port/apiKey）：迁移时直接忽略旧字段（JSON 反序列化加 `ignoreUnknownKeys`），`AppConfig`/`ConnectionState` 相关模型清理
- `di/DataModule.kt` 中对应 @Binds/@Provides 清理

保留：Ktor HTTP client（五个用量 API）、`UsagePollingWorker`、`NotificationHelper`、五个用量 API 类。

## 二、首页重构（`ui/home/HomeScreen.kt` + `UsageTab.kt`）

- 删除 `HomeTab` sealed class 和底部导航，`HomeScreen` 直接就是用量页：
  ```
  Scaffold(
    topBar = TopAppBar(title="用量监控", actions=[设置 IconButton])
  ) { PullToRefreshBox(isRefreshing = uiState.isLoading, onRefresh = viewModel::refresh) { UsageList(...) } }
  ```
- `UsageTab.kt`：
  - 移除 `LayoutToggleIcon`、`UsageGrid`、`RefreshButton` 及 `SharedPreferences "ui_prefs"` 读写
  - `UsageList` 改为 `LazyColumn`（下拉刷新需要可滚动容器）
  - 复用现有 `ProviderCard`/`UsageBar`/`DeepseekBalance`，保留 pace 徽章、reset 标签逻辑
  - 卡片微调：标题行加"上次更新于 HH:mm"小字（数据来自 `UsageProviderState.lastUpdated`），无 token 的卡片显示"未配置 → 去设置"点击跳设置
- `HomeViewModel`：删除 `projectSync` combine 及 `ProjectSyncRepository` 依赖；`refresh()` 逻辑不变

## 三、设置页重构（`ui/settings/`）

Material3 最佳实践：分组 `ListItem` 列表 + 逐项点击编辑、**即时保存**（无底部保存按钮）。

布局（单屏 `LazyColumn`，分组标题小字）：

1. **通用** 分组
   - 主题：ListItem → 单选对话框（浅色/深色/跟随系统），选中即存
   - 轮询间隔：ListItem → 单选对话框（5/10/15/30/60 分钟，与桌面端 `VALID_INTERVALS` 一致），选中即存并 `UsagePollingWorker.enqueue()` 更新
   - 提醒阈值（Warn %）：ListItem → 对话框滑块/数字输入，保存时校验 warn < danger
   - 危险阈值（Danger %）：同上
   - 全局代理 URL：ListItem → 输入对话框
2. **服务商** 分组（Kimi / MiniMax / Copilot / DeepSeek / 火山引擎 各一行）
   - 每行 `ListItem`：图标 + 名称 + 副标题状态（"已启用" / "未配置 Token" / "已停用"）+ trailing `Switch`
   - 点击行 → `ModalBottomSheet` 或 `AlertDialog` 表单：Token/Cookie 输入（`PasswordVisualTransformation` + 可见性切换）、火山引擎多一个 x-csrf-token 字段、"使用全局代理" Checkbox；确认即存
   - `Switch` 直接切 `enabled`，即时保存
3. 移除：扫码导入按钮、保存按钮、超长表单、`showToken` 死状态

`SettingsViewModel` 改造：每个编辑动作对应一个 `update*(...) `方法，内部 `configRepository.save()`（`SecureConfigStore` 已支持整体写）；保留 warn<danger 校验（对话框内提示错误，不合法不关闭）。

## 四、桌面小组件（新增 Glance）

**依赖**（`gradle/libs.versions.toml` + `app/build.gradle.kts`）：
- `androidx.glance:glance-appwidget:1.1.1`、`glance-material3`
- WorkManager 已有，刷新复用现有 `UsagePollingWorker`

**数据持久化（小组件跨进程读取的前提）**：
- `UsageRepositoryImpl.refresh()` 成功后，把 `UsageSnapshot` JSON 序列化写入 `DataStore<Preferences>`（新依赖 `androidx.datastore:datastore-preferences`，或复用 Room；选 DataStore，轻量）
- `observeUsage()` 改为读 DataStore（启动即有上次缓存，小组件和 UI 共用一份）

**新增文件**：
- `widget/UsageWidget.kt` — `GlanceAppWidget`：纵向列出已启用服务商，每行 = 名称 + `LinearProgressIndicator` + 百分比（used%，与 APP 语义一致），底部"更新于 HH:mm"；整件点击 `actionStartActivity<MainActivity>()`；颜色按 warn/danger 阈值着色（绿/黄/红）
- `widget/UsageWidgetReceiver.kt` — `GlanceAppWidgetReceiver`
- `res/xml/usage_widget_info.xml` — minWidth 250dp × minHeight 110dp，resizable，updatePeriodMillis=0（更新由 Worker 驱动，不用系统周期）
- `AndroidManifest.xml`：注册 receiver（`APPWIDGET_UPDATE` action + meta-data）
- `UsagePollingWorker.doWork()` 末尾调用 `UsageWidget().updateAll(context)`；`HomeViewModel.refresh()` 成功后同样触发

**配置变更后**：保存配置（SettingsViewModel）时也触发 `updateAll`，让启用状态变化立即反映到小组件。

## 五、清理与收尾

- `strings.xml`：删掉 Claude/扫码相关字符串，新增设置/小组件文案（保持简体中文）
- 主题：保持现有静态配色不动（不在本次范围）
- `AndroidManifest.xml`：移除 CAMERA、POST_NOTIFICATIONS 中不再需要的（CAMERA 删除；通知保留）
- 移除依赖：CameraX、ML Kit barcode（随扫码删除）；`security-crypto` 保留（SecureConfigStore 仍用）
- `AGENTS.md` 更新安卓章节描述（单屏用量监控 + 小组件、无扫码）
- 按 `.vibe-harness` 约定写 plans/history 并更新 `index.md`

## 六、验证

1. `cd android-app && ./gradlew assembleDebug` 编译通过
2. `./gradlew test`（若有单测）通过
3. 手动确认项（写进交付说明，由用户真机验证）：
   - 首页下拉刷新触发 loading 并更新数据
   - 设置每项修改立即生效（改间隔后 Worker 重新调度）
   - 桌面添加小组件显示用量，点击打开 APP

## 实施顺序

1. 删除扫码/项目同步代码及依赖（编译先行打通）
2. 首页重构（单页 + PullToRefreshBox + LazyColumn）
3. 设置页重构（分组列表 + 对话框编辑 + 即时保存）
4. UsageSnapshot 持久化到 DataStore
5. Glance 小组件 + Worker 联动
6. 收尾清理（manifest、strings、AGENTS.md、vibe-harness 记录）

## 执行方式

由主 agent 按上述顺序拆分为若干任务，**派 coder subagent 执行，模型统一使用 `fangzhou/deepseek-v4.1-flash`**；每个 subagent 任务附带本方案相关章节和关键文件路径，主 agent 负责串行衔接、最终编译验证与收尾记录。
