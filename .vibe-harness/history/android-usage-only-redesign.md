# android-usage-only-redesign

- 时间：2026-10-07
- 计划：[plans/android-usage-only-redesign.md](../plans/android-usage-only-redesign.md)

## 改动摘要

安卓 APP 从「桌面端伴侣（扫码配网 + Claude 项目同步 + 用量）」收敛为**独立的单一 AI 用量监控工具**：删掉扫码/桌面同步整条链路，首页改为单屏用量列表 + 下拉刷新，设置页改为 Material3 分组列表 + 对话框即时保存，新增 Glance 桌面小组件（用量进度 + 余额 + 更新时间）。分 4 个阶段执行，最终 `assembleDebug` 编译通过。

## 阶段 1：删除扫码/项目同步 + 首页重构

**删除文件（18）**

- `ui/home/ClaudeTab.kt`、`ui/scan/{ScanScreen,ScanViewModel}.kt`（目录删除）
- `domain/repository/{ProjectSyncRepository,ConnectionState}.kt`、`data/repository/ProjectSyncRepositoryImpl.kt`、`data/remote/DesktopSyncClient.kt`
- `lifecycle/AppLifecycleObserver.kt`（目录删除）
- `domain/model/{ProjectSync,SyncEvent,ClaudeHookPayload,TimestampSerializers}.kt`（`TimestampSerializers` 是清单外的连带死代码：唯一使用者是被删的 `ProjectSync.kt`）
- `domain/utils/TimeUtils.kt`（仅 `ClaudeTab` 使用）
- `data/local/{SyncEntities,SyncDao,AppDatabase}.kt`（删完实体后 0 张表，Room 整体移除）
- `ui/components/{GridProviderCard,ConcentricRings}.kt`（仅网格模式使用）

**修改（16）**

| 文件 | 改动 |
|------|------|
| `MainActivity.kt` | 删 `scan` 路由与 `ScanScreen` import，导航只剩 home/settings |
| `AiSignalLightApplication.kt` | 删 `AppLifecycleObserver` 注入与 `start()` |
| `di/DataModule.kt` | 删 `bindProjectSyncRepository` 与全部 Room provider |
| `domain/repository/ConfigRepository.kt` | 删 `DesktopConnection` 及 3 个桌面连接方法 |
| `domain/model/AppConfig.kt` | 删 `QrPayload` |
| `data/local/SecureConfigStore.kt` | 删连接流/读写/`loadConnection`/`KEY_DESKTOP_*` |
| `ui/home/HomeScreen.kt` | **重写**：Scaffold + TopAppBar("用量监控" + 设置图标) + `PullToRefreshBox(isRefreshing = uiState.isLoading)` 包 `UsageList`；删 `HomeTab`/底部导航/`ConnectionBanner`（通知权限被拒提示保留为列表上方一行红字）；POST_NOTIFICATIONS 请求保留 |
| `ui/home/UsageTab.kt` | **重写**：删 `UsageTab`/`UsageGrid`/`RefreshButton`/`LayoutToggleIcon`/`ui_prefs`；`UsageList` 改 `LazyColumn`；卡片标题行加"更新于 HH:mm"；无 token 卡片文案改"未配置，点我去设置"且整卡可点跳设置；DeepSeek 卡同样处理 |
| `ui/home/HomeViewModel.kt` | 删 `ProjectSyncRepository` 依赖、`combine` 订阅、`HomeUiState.projectSync` |
| `ui/components/ProviderCard.kt` | 新增可选 `updatedLabel`、`onClick`（用 `Modifier.clickable`，非实验性 Card 重载） |
| `ui/components/DeepseekBalance.kt` | 删 `DeepseekBalanceTile`；`DeepseekBalanceCard` 加 `onClick` + no_token 文案 |
| `ui/settings/SettingsScreen.kt` | 最小改动：删"扫码导入配置"按钮 |
| `res/values/strings.xml` | 删 Claude/扫码/连接相关条目，新增 `home_title`/`updated_at`/`not_configured_open_settings` |
| `AndroidManifest.xml` | 删 CAMERA 权限与 camera uses-feature |
| `app/build.gradle.kts`、`gradle/libs.versions.toml` | 删 CameraX×4、ML Kit barcode |

## 阶段 2：设置页重构

- `ui/settings/SettingsScreen.kt` **重写**（316 → 593 行）：`LazyColumn` 分组（`通用` / `服务商`，`labelMedium` + `primary` 小标题）替代长表单；底部保存按钮移除，全部即时保存。
  - 通用：主题 / 轮询间隔 / 提醒阈值 (Warn) / 危险阈值 (Danger) / 全局代理 —— 每行 `ListItem`（headline + 当前值 supporting），点击弹 `AlertDialog`。主题与间隔是**单选即时生效并关闭**；阈值对话框内数字输入 + 双校验（非数字/超 0–100、`warn < danger`），不合法时确定按钮 disabled 且不关闭；代理可留空。
  - 服务商：Kimi / MiniMax / Copilot / DeepSeek / 火山引擎 各一行 `ListItem`（supporting 显示 已启用/未配置 Token/已停用）+ trailing `Switch`（切 enabled 即时保存）；点行弹表单对话框（Token/Cookie + 可见性切换 + 使用全局代理，火山引擎多一个 x-csrf-token 与 DevTools 说明）。
- `ui/settings/SettingsViewModel.kt` **重写**：`StateFlow<AppConfig>`（由 `observeConfig()` 收集）+ 逐项 `update*()`；新增 `enum SettingsProvider`；`updateInterval` 校验合法值并 `UsagePollingWorker.enqueue()`；`updateThresholds` 校验 `0..100` 且 `warn < danger`；私有 `update()` **先写内存再落盘**，避免同帧连续两次编辑互相覆盖。
- `ConfigRepository` / `SecureConfigStore`：删掉因重构变为死代码的 `saveThemeMode`（主题改走 `saveConfig(copy(themeMode=…))`）。
- `strings.xml`：新增 30 条设置页文案；删 `usage_title`/`save`/`refresh`/`error_no_token`/`last_update`（grep 确认为零引用）。

## 阶段 3：用量快照持久化 + Glance 桌面小组件

**新增**

- `data/local/UsageSnapshotStore.kt`：`preferencesDataStore(name = "usage_snapshot")` 存 `UsageSnapshot` JSON（`ignoreUnknownKeys`/`encodeDefaults`）；对外 `snapshotFlow: Flow<UsageSnapshot?>`（解析失败/无数据 → null，`IOException` 降级为空 Preferences）与 `suspend save()`（编码/写盘异常静默吞掉）；`@Singleton` + `@Inject` 构造注入。
- `widget/UsageWidget.kt`：`GlanceAppWidget`，标题 + 每个「已启用且已配置」服务商一行（名称 + 进度条 + used%）+ 底部"更新于 HH:mm"；无配置时显示"未配置，打开 APP 设置"；整件 `actionStartActivity(Intent(context, MainActivity::class.java))`。Kimi/火山引擎取各窗口已用最大值，MiniMax 取 `100 - 剩余`，Copilot 取 premium，DeepSeek 只显示余额文本；有配置但快照无数据时显示 `—`。阈值着色：used < warn 绿 / < danger 黄 / 否则红。
- `widget/UsageWidgetReceiver.kt`：`GlanceAppWidgetReceiver`。
- `res/xml/usage_widget_info.xml`：minWidth 250dp / minHeight 110dp，`targetCellWidth/Height` 4×2，`resizeMode="horizontal|vertical"`，`updatePeriodMillis="0"`（刷新由 Worker/手动驱动）。
- `AndroidManifest.xml`：注册 receiver（`exported="true"` + `APPWIDGET_UPDATE` + `meta-data android.appwidget.provider`）。

**修改**

| 文件 | 改动 |
|------|------|
| `domain/model/UsageData.kt` | 全部用量 data class 补 `@Serializable`（含泛型 `UsageProviderState<T>`） |
| `data/repository/UsageRepositoryImpl.kt` | 注入 `UsageSnapshotStore`；`_usageFlow` 改 `MutableStateFlow<UsageSnapshot?>(null)`；`observeUsage()` = 先发磁盘缓存（`snapshotFlow.first()`）再 `emitAll(_usageFlow.filterNotNull())`，**未刷新时不发空快照覆盖缓存**；`refresh()` 成功后落盘 |
| `worker/UsagePollingWorker.kt` | `doWork()` 成功后 `UsageWidget().updateAll(applicationContext)` |
| `ui/home/HomeViewModel.kt` | `refresh()` 成功后 `UsageWidget().updateAll(context)` |
| `ui/settings/SettingsViewModel.kt` | 每次保存配置后 `UsageWidget().updateAll(context)`（enabled/阈值改动即时反映） |
| `res/values/strings.xml` | 新增 `widget_title`/`widget_empty`/`widget_description`（底部时间复用 `updated_at`） |

三处 `updateAll` 均用 `runCatching {}` 包裹：小组件刷新失败不影响主流程。

## 阶段 4：编译修复（以 Glance 1.1.1 jar 为准）

首次编译报 9 条错误，用 `javap` 核对 `~/.gradle/caches/.../androidx.glance/*/1.1.1` 的真实签名后修正：

- `updateAll` 是 `GlanceAppWidgetKt` 的**顶层扩展函数**（不是成员方法）→ 三个调用方补 `import androidx.glance.appwidget.updateAll`；`provideContent` 同理（原 import 正确）。
- `ColorProvider` 在 **`androidx.glance.unit`**（`androidx.glance.color` 只有 `ColorProviders`/`DayNightColorProvider`）；`androidx.glance.unit` 无 day/night 双参工厂 → 改用单参 `ColorProvider(Color(...))`，背景/文字改用 `GlanceTheme.colors.background/onBackground/onSurfaceVariant`。
- `defaultWeight` 是 `RowScope` 接口成员，无顶层函数 → 删掉该 import 与全部用法。
- `actionStartActivity` 无 reified Activity 泛型版 → 改 `actionStartActivity(Intent(context, MainActivity::class.java))`。
- Glance 无 `fillMaxWidth(fraction)`/`LinearProgressIndicator` → 进度条改固定宽度槽（`barWidth = 110.dp`、`barHeight = 6.dp`）+ `Row` 左对齐填充条，填充宽 = `(110 * percent / 100f).dp`；无进度条的行用同宽 `Spacer` 占位对齐。

## 依赖变化

- **新增**：`androidx.glance:glance-appwidget:1.1.1`、`androidx.glance:glance-material3:1.1.1`、`androidx.datastore:datastore-preferences:1.1.1`
- **移除**：CameraX 4 条 + ML Kit barcode（随扫码删除）、Room 3 条 + 对应 `ksp(room-compiler)`、`androidx.lifecycle:lifecycle-process`（随 AppLifecycleObserver）、`ktor-client-websockets`（随 DesktopSyncClient）
- **保留**：`security-crypto`（SecureConfigStore 仍用）、Ktor HTTP 相关 5 条、WorkManager + Hilt、kotlinx-serialization

## 关键决策

- **完全移除扫码导入与桌面同步**，APP 独立直连五家用量 API（无 host/port/apiKey 配置项）。
- 首页只保留「列表卡片」一种布局，删除网格/同心环/布局切换。
- 配置兼容：`SecureConfigStore` 的 JSON 解析一直带 `ignoreUnknownKeys = true`，旧配置可平滑读取；旧的 `desktop_host`/`desktop_port`/`desktop_api_key` SharedPreferences key 不再被读取（未主动删除，无副作用）。
- 小组件读数据走 **Hilt EntryPoint**（`UsageWidget` 不在注入路径上），避免手工构造 store 实例。
- 小组件进度条自绘而非用 `androidx.glance.appwidget.components.LinearProgressIndicator`，并用固定 dp 宽度（Glance 无比例尺寸）。
- 设置页 Token 可见性用文字按钮"显示/隐藏"而非眼睛图标：`material-icons-extended` 不是本工程依赖，未擅自引入。

## 影响范围

- 改动集中在 `android-app/**`；桌面端（Electron）代码零改动。
- 桌面端仍保留 `src/main/pairing.ts`（QR 生成）与 `StatusServer` 的 `getConfig` 处理器，但**已无消费端**；相关代码后续可考虑清理。
- `AGENTS.md` 的 android-app 概述、架构树、State Model「QR pairing」条目已同步为现状。
- 旧设备上 `ai_signal_light.db`（Room）文件仍残留，代码已不再打开，可忽略。
- 旧安装首次启动：DataStore 无快照 → 首页先空列表 + 转圈，首次 refresh 后正常。

## 验证

- `cd android-app && ./gradlew assembleDebug` **编译通过**（由主 agent 执行；阶段 4 的 9 条错误已全部修复后再编译通过）。
- 未验证（需真机/模拟器）：
  - 首页下拉刷新触发 loading 并更新数据；冷启动立即显示上次缓存
  - 设置每项即时生效、改间隔后 Worker 重新调度、阈值非法时对话框不关闭
  - 桌面添加小组件、进度条/阈值颜色、点击打开 APP、Worker 与配置保存后小组件自动刷新

## 后续可选事项

- `glance-material3` 依赖已声明但代码未引用（用的是 core 的 `GlanceTheme{}`；material3 的 `GlanceTheme` 是 object，同名会冲突，需 import 别名）。
- 小组件进度条固定 110dp 宽，横向拉得很宽时右侧会留白。
- 若想恢复深浅色差异化的小组件进度条配色，可用 `androidx.glance.color` 包的双参工厂（需 import 别名避免与 `androidx.glance.unit.ColorProvider` 冲突）。
