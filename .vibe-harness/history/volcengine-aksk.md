# Volcengine provider 改用 AK/SK 官方 OpenAPI

## 问题

火山 Coding Plan 额度走控制台内部接口 `console.volcengine.com/api/top/ark/.../GetCodingPlanUsage`，
靠手工复制的 Cookie + `x-csrf-token` 鉴权，登录态约一天就失效，额度显示长期挂掉。

社区同类工具的维护成本标注是"约 7 天换一次 Cookie"，一天就断属于异常。
根因在 `syncVolcengineCsrf`：只把服务端轮换的 `csrfToken` 回写配置，同批 Set-Cookie 里
其它登录态 cookie 全丢了，等于永远在用登录那一刻的那份。

根治办法不是把 Cookie 存得更久，而是换鉴权方式。

## 方案

`GetCodingPlanUsage` 有官方 OpenAPI 版本，用 AK/SK 做 V4 签名调用，与登录态彻底解耦。
参考 dsh-billing-balance / volcengine-coding-plan-monitor / cc-switch 的社区实现。

### 签名（src/main/volcengine-sign.ts）

按官方文档 https://www.volcengine.com/docs/6369/67269 手写，不引官方 SDK——文档的 GET 示例
给出了一整套可复现的测试向量，手写能离线断言，引 SDK 反而没法测。

**关键歧义（已由测试拍板）**：文档正文说派生链每步把结果当 hex 字符串做下一轮密钥，
文档自带的 Java 示例却用原始二进制。两种产出不同签名。实测**原始二进制**正确——
文档公布的 Signature `1eda9e7e...` 一次复现，hex 方案不匹配。

SignedHeaders 取文档 GET 示例的最小集 `host;x-date`。

### 鉴权优先级

AK/SK 优先 → 失败回退 Cookie。社区实测 Cookie 通道三档字段最完整，所以两条路都留。
AK/SK 响应若缺 session/weekly/monthly 任一档，视为不完整并回退，而不是展示 0。

### 安全修复

`toMobileConfig` 原本 `{...config.volcengine}` 把整个配置下发到手机。新增的 AK/SK 是
**永不过期**的控制面密钥，手机端又没有任何 AK/SK 代码路径（安卓只用 cookie 自取额度），
故从移动端投影中剔除，`MobileAppConfig.volcengine` 类型收窄为 `Omit<..., 'accessKey'|'secretKey'>`，
让 TS 强制住。

## 实际改动

| 文件 | 改动 |
|------|------|
| `src/main/volcengine-sign.ts` | 新增：V4 签名纯函数 + `buildCanonicalQuery` / `formatXDate` / `buildVolcengineUrl` |
| `src/main/volcengine-sign.test.ts` | 新增 12 条：官方文档 GET 测试向量（CanonicalRequest 哈希 + Signature）、RFC3986 编码、query 排序、空 body 哈希、Authorization 格式、签名绑定 X-Date |
| `src/main/usage-monitor.ts` | 新增 `fetchVolcengineByAksk`（签名 → OpenAPI，缺档抛错回退）；原逻辑改名 `fetchVolcengineByCookie`；入口按 AK/SK 是否齐备分派；`mapVolcengineUsage` 兼容 `ResetTime`；`syncVolcengineCsrf` 改为合并全部 Set-Cookie（新增纯函数 `parseCookieJar` / `mergeCookiePair`） |
| `src/shared/types/config.ts` | `VolcengineProviderConfig` 加 `accessKey` / `secretKey`；`MobileAppConfig.volcengine` 收窄剔除这两个字段 |
| `src/main/config.ts` | DEFAULTS 补 `accessKey: ''` / `secretKey: ''`（spread 合并自动兼容旧配置文件） |
| `src/shared/types/ipc.ts` | `SettingsPayload` 加 `hasVolcengineAccessKey` / `hasVolcengineSecretKey`；`SettingsSavePayload.volcengine` 加两组 `*Changed` |
| `src/main/main.ts` | SETTINGS_GET 脱敏返回新字段；SETTINGS_SAVE 变更协议收敛为 `keepOrTake` 循环，四个凭证字段同款处理 |
| `src/main/pairing.ts` | `toMobileConfig` 剔除 AK/SK |
| `src/renderer/src/Settings.vue` | 火山区块顶部加 Access Key ID / Secret Access Key 两个密码框 + 获取地址说明；Cookie 标注为「回退通道」 |
| `src/main/usage-monitor.test.ts` | 新增 7 条：`ResetTime` 别名、cookie jar 解析/合并边界 |
| `AGENTS.md` | Usage quotas 段补 AK/SK 通道与「AK/SK 不下发手机」约束 |

## 验证

- `npm test` 148 passed / 12 files（原 129，+19）
- `npm run typecheck` 通过
- `npm run build:main` / `build:renderer` 通过
- **真实网关探测**（用无效 AK/SK 探请求形状）：
  ```
  GET https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01
  → HTTP 401 {"Code":"InvalidAccessKey"}
  ```
  网关正确识别了 Action / Version / Service=ark / Region=cn-beijing，只在密钥处拒绝，
  说明 host、查询串、签名头结构都对。签名算法正确性由官方测试向量离线证明。

## 遗留

- **未用真实 AK/SK 跑通**（用户尚未提供）。需要在设置窗口填入后确认：签名被接受、
  `Result.QuotaUsage[]` 三档齐全（社区反馈 AK/SK 可能缺档，本实现会自动回退 Cookie）
- 安卓端 `VolcengineApi.kt:109` 有同样的"只回写 csrfToken"问题，且安卓仍只有 cookie 通道，
  本次未动
