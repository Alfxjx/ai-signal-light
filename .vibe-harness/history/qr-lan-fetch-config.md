# qr-lan-fetch-config

## 改动摘要
修复桌面端「打开二维码窗口」抛出 `The amount of data is too big to be stored in a QR Code` 的问题。原因是 QR 码默认错误纠正级别 M 容量 ~2331 字节，而 `encodeQrPayload` 把整个 `AppConfig`（含 3 个 provider token）JSON 化塞进去，长 token 累加后就超限。

改为：QR 只携带 `{v, host, port, apiKey}`（~120 字节）；手机端扫码后用 apiKey 连 WS，发 `getConfig` 请求，桌面回精简配置 `MobileAppConfig`（去掉 window/hooks/floatingBall/lanMode 四个桌面专属字段）。

## 影响范围
- `src/shared/types/config.ts` — 新增 `MobileAppConfig` 类型作为移动端契约
- `src/shared/types/websocket.ts` — 新增 `ClientWsMessage` 联合类型；在 `WsMessage` 加 `configSnapshot` 服务端响应
- `src/main/pairing.ts` — `QrPayload` 删除 `config` 字段；新增 `toMobileConfig()` 投影函数
- `src/main/server.ts` — `ws.on('message')` 新增 `getConfig` 分支，鉴权由现有 `verifyClient` 保障（连接升级时已校验）
- `android-app/.../domain/model/AppConfig.kt` — `QrPayload` 删 `config`，`apiKey` 非 nullable
- `android-app/.../data/remote/DesktopSyncClient.kt` — 新增出站能力：`sendMutex` 串行化 send、`currentSession` 引用、`pending: ConcurrentHashMap<requestId, CompletableDeferred>` 请求-响应匹配、`fetchConfig()` 公开方法
- `android-app/.../ui/scan/ScanViewModel.kt` — 改造为：parse → saveDesktopConnection → connect+等连接 → fetchConfig → saveConfig → enqueue polling worker，三段错误分别给中文提示
- `android-app/.../domain/repository/ConfigRepository.kt` — 删除 `saveQrPayload`（已无人调用，避免遗留 `payload.config` 编译失败）
- `android-app/.../data/local/SecureConfigStore.kt` — 同步删除 `saveQrPayload` 实现，清理 `QrPayload`/`SharedPreferences` import

## 兼容性
破坏性升级：旧版 Android 扫新 QR（不含 config）会因 JSON 缺字段报错；新版 Android 扫旧 QR（含 config）会因为字段不再被消费而被 kotlinx.serialization 忽略（`ignoreUnknownKeys = true`），但旧 QR 的 apiKey 仍然有效——所以**实际只有一种方向破坏**：桌面升级后，旧版手机扫码会失败。

## 验证结果
- `npm run typecheck` 通过
- 烟雾测试：原 2034 字节 payload → 新 116 字节，toMobileConfig 返回 6 个预期字段

## 未做
- 未跑 Android 端编译（需 Android SDK + gradle，本地环境缺）；建议在 PR 前用 `./gradlew :app:compileDebugKotlin` 跑一次
- 未端到端联调（需真机+同一 LAN）