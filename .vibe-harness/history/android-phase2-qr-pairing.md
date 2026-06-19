# Android 版 Phase 2：二维码导入配置

## 时间
2026-06-19

## 改动原因
延续 Phase 1，实现桌面端生成配对二维码、手机端扫码导入完整配置，并完成桌面端 LAN 模式改造（绑定地址切换、`apiKey` 鉴权、二维码窗口）。

## 改动范围

### 桌面端
- `src/shared/types/ipc.ts`
  - `SettingsSavePayload` 增加 `lanMode` 字段
  - `ElectronAPI` 增加 `openQrWindow`
  - 增加 `QR_OPEN` IPC 通道
- `src/main/config.ts`
  - 默认配置加入 `lanMode: { enabled: false, apiKey: '' }`
  - 加载与更新逻辑支持 LAN 开关和 apiKey
- `src/main/server.ts`
  - 根据 `lanMode.enabled` 切换监听 `127.0.0.1` / `0.0.0.0`
  - WebSocket `verifyClient` 与 HTTP API `requireAuth` 增加 `Authorization: Bearer <apiKey>` 鉴权
  - 静态文件仅允许本机访问
  - 新增 `restart()` / `isLanEnabled()` 供 LAN 切换时重启服务
- `src/main/pairing.ts`（新增）
  - `generateApiKey()` / `getLanIp()` / `buildQrPayload()` / `encodeQrPayload()`
  - 二维码 payload 包含 `host`、`port`、`apiKey`、完整明文 `AppConfig`
- `src/main/main.ts`
  - 托盘菜单增加「LAN 模式」开关与「显示手机配对二维码」
  - 新增 `openQrWindow()`，使用 `qrcode` 生成二维码并弹出窗口提示安全警告
  - 监听配置变化，LAN 开关变化时自动重启 `StatusServer`
  - `SETTINGS_GET` / `SETTINGS_SAVE` 处理 `lanMode`
  - 新增 `QR_OPEN` IPC handler
- `src/main/preload.ts`
  - 暴露 `openQrWindow` 给渲染进程
- `src/renderer/src/Settings.vue`
  - 新增「手机配对（LAN 同步）」区块：LAN 开关、二维码按钮、明文 Token 风险提示
  - 保存设置时携带 `lanMode.enabled`
- `package.json`
  - 新增运行时依赖 `qrcode` ^1.5.4
  - 新增 dev 依赖 `@types/qrcode`

### Android 端
- `android-app/app/build.gradle.kts`
  - 接入 CameraX 1.4.1 + ML Kit Barcode Scanning 17.3.0
- `android-app/app/src/main/AndroidManifest.xml`
  - 声明 `CAMERA` 权限
  - 开启 `usesCleartextTraffic="true"` 以支持 LAN 下 HTTP/WS
- `android-app/app/src/main/java/com/aisignallight/ui/scan/ScanViewModel.kt`（新增）
  - 解析 QR JSON 为 `QrPayload`，存入 `SecureConfigStore`
  - 扫码成功后触发 `UsagePollingWorker` 并按新配置轮询
- `android-app/app/src/main/java/com/aisignallight/ui/scan/ScanScreen.kt`（新增）
  - CameraX + PreviewView 实时预览
  - ML Kit 二维码识别
  - 动态请求相机权限，识别成功后自动保存并返回
- `android-app/app/src/main/java/com/aisignallight/MainActivity.kt`
  - 导航图增加 `scan` 路由
- `android-app/app/src/main/java/com/aisignallight/ui/settings/SettingsScreen.kt`
  - 新增「扫码导入桌面配置」入口按钮

## 验证结果
- `npm run typecheck` 通过
- `./gradlew assembleDebug` 通过
- `./gradlew testDebugUnitTest` 通过

## 已知限制 / 下一阶段
- 二维码使用完整明文配置，需依赖 UI 提示用户不要截图分享
- Phase 3 需实现 Android 端 `DesktopSyncClient`（WebSocket LAN 连接）与 Claude 项目状态同步
- Room 缓存将在 Phase 3 接入，用于离线展示项目列表
