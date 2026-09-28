# Volcengine provider 改用 AK/SK 官方 OpenAPI

## 背景

火山 Coding Plan 额度当前走控制台内部接口（`console.volcengine.com/api/top/ark/.../GetCodingPlanUsage`），
靠手工复制的 Cookie + `x-csrf-token` 鉴权，约一天就失效。

## 结论先行

`GetCodingPlanUsage` 有官方 OpenAPI 版本，AK/SK + V4 签名调用，与登录态解耦。
社区（dsh-billing-balance / volcengine-coding-plan-monitor / cc-switch）都走这条路，
官方还有 ark-cli（`arkcli usage plan`）。

## 实施计划

1. `src/main/volcengine-sign.ts`：V4 签名纯函数（不引官方 SDK，用文档测试向量离线验证）
2. `src/main/volcengine-sign.test.ts`：复现官方文档 GET 示例的 CanonicalRequest 哈希与 Signature
3. 实测真实请求，确认三档字段是否齐全
4. `usage-monitor.ts` 接入 AK/SK 通道，Cookie 降级为回退；顺带修 `syncVolcengineCsrf` 只回写 csrfToken 的 bug
5. 配置类型 / IPC / Settings UI / 移动端投影
6. 测试 + typecheck + 文档

## 已定决策

- **不引官方 SDK**：官方文档 GET 示例给了完整可复现的测试向量，手写签名能离线断言
- **AK/SK 优先，Cookie 兜底**：社区实测 Cookie 通道三档字段最完整
- **AK/SK 缺档即回退**：响应缺 session/weekly/monthly 任一档时抛错回退，而不是展示 0
- **AK/SK 不下发手机端**：`toMobileConfig` 剔除，手机无 AK/SK 代码路径
- **派生链用原始二进制摘要**：文档正文说 hex、Java 示例用二进制，以测试向量判定为二进制

## 预估

人工开发约 1 人日。
