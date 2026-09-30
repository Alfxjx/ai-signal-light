# 新增智谱 GLM Coding Plan 用量 provider（调研存档，待开发）

> 状态：**仅调研，未开工**。2026-09-29 存盘，留给后续 session 直接进入编码。
> 触发原因：用户问「智谱国内版 coding plan 额度怎么查」，并说明**自己没有订阅**，
> 所以本文档把「接口事实」与「未验证假设」严格分开，开发前请先读「待验证清单」。

## 背景

本项目的用量监控已覆盖 Kimi / MiniMax / Copilot / DeepSeek / Codex / 火山 / MiMo。
智谱 GLM Coding Plan 在社区（cc-switch、sub2api、token-monitor）已有成熟的额度查询实现，
但智谱**没有把这个 HTTP 接口写进开放文档**，官方只以 Claude Code 插件（`glm-plan-usage`）形式暴露。

## 结论先行

- 国内版额度端点：`GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`
- 鉴权：`Authorization: <Coding Plan API Key>`，**不加 `Bearer ` 前缀**（官方插件源码与 cc-switch 抓包一致）
- **HTTP 状态码恒为 200**，成功/失败都靠 body 里的 `success` / `code` / `msg` 判定
- 返回 5 小时 + 每周两个百分比窗口（`TOKENS_LIMIT`），外加每月 MCP 次数（`TIME_LIMIT`）
- 形态与本项目现有 Kimi（`codingWeekly` / `codingFiveHour`）语义高度一致，可复用同一套渲染

## 请求

```
GET https://open.bigmodel.cn/api/monitor/usage/quota/limit
Authorization: <Coding Plan API Key>        ← 无 Bearer 前缀
Content-Type: application/json
Accept-Language: en-US,en
```

国际版走 `https://api.z.ai/api/monitor/usage/quota/limit`，路径与字段完全一致
（同一后端），仅域名不同。本阶段只做国内版。

### 实测记录（2026-09-29，假 token）

```
curl.exe -s -i "https://open.bigmodel.cn/api/monitor/usage/quota/limit" \
  -H "Authorization: invalid-test-token-0000" \
  -H "Content-Type: application/json" -H "Accept-Language: en-US,en"

HTTP/1.1 200 OK
{"code":401,"msg":"token expired or incorrect","success":false}
```

→ 证实两点：**HTTP 层不区分成败**；业务错误码放在 body。

## 响应

```json
{
  "code": 200, "msg": "操作成功", "success": true,
  "data": {
    "level": "pro",
    "limits": [
      { "type": "TOKENS_LIMIT", "unit": 3, "number": 5, "percentage": 44, "nextResetTime": 1774967594803 },
      { "type": "TOKENS_LIMIT", "unit": 6, "number": 7, "percentage": 53, "nextResetTime": 1776664808974 },
      { "type": "TIME_LIMIT",   "unit": 5, "number": 1, "usage": 1000, "currentValue": 72,
        "remaining": 928, "percentage": 7, "usageDetails": [ /* ... */ ] }
    ]
  }
}
```

| 字段 | 含义 |
|---|---|
| `data.level` | 套餐档位：`lite` / `pro` / `max` |
| `TOKENS_LIMIT` + `unit:3` | **5 小时滚动窗口**，`percentage` = 已用 % |
| `TOKENS_LIMIT` + `unit:6` | **每周窗口**，`percentage` = 已用 %（`number` 实测有 `7` 和 `1` 两种） |
| `TIME_LIMIT` | **每月 MCP 调用次数**，默认 `usage: 1000`，已用 `currentValue`，剩余 `remaining` |
| `nextResetTime` | 毫秒时间戳 |

### 解析规则（重要）

1. **按 `unit` 分类，不要按 `nextResetTime` 排序**。周期末尾时周窗口比 5 小时窗口更早重置，
   按时间排序必然把两个桶标反（cc-switch 已记录该 bug：issue #3036）。
   - `unit === 3` → 5h；`unit === 6` → 周
   - `unit` 缺失或不认识 → 兜底启发式：无 `nextResetTime` 的优先归 5h，其余按 reset 升序填空槽
2. **老套餐（2026-02-12 前订阅）只回 1 条 `TOKENS_LIMIT`**，自然降级为「只有 5 小时档」。
3. `percentage` 直接就是**已用 %**，不需要 `100 - x` 反转（与 MiniMax 的
   `*_remaining_percent` 相反，别照抄 MiniMax 的解析）。
4. 类型比较做大小写不敏感，并兼容上游改名 `CREDIT_LIMIT`（cc-switch 已防御这一点）。
5. 业务失败分流：`success === false` → 取 `msg` 报错；`code === 401` → 视为凭据失效。

## 团队版（本阶段不做，仅存档）

|  | 个人版 | 团队版 |
|---|---|---|
| URL | `/api/monitor/usage/quota/limit` | 同路径 + `?type=2` |
| 头 | `Authorization` | `Authorization` + `bigmodel-organization: org-xxxxxx` + `bigmodel-project: proj-xxxxxx` |
| 站点 | 国内站 / z.ai | **仅国内站**（z.ai 无 team 档） |

响应结构与个人版完全一致，解析侧可复用。官方插件文档明确覆盖范围是「仅个人版」。
组织 ID / 项目 ID 可从团队管理后台用量页 URL 里取。

## 辅助端点（官方插件里有，字段未公开）

```
/api/monitor/usage/model-usage?startTime=<yyyy-MM-dd HH:mm:ss>&endTime=<...>
/api/monitor/usage/tool-usage?startTime=<...>&endTime=<...>
```

官方插件取的是「昨天当前整点 → 今天当前整点 :59:59」的约 24h 窗口。返回 token / 工具调用明细，
**官方插件没打印字段说明**，需要真实 key 抓一次才能定形。非必需，可先不做。

## 「没有订阅」会怎样（未验证）

- 该接口只回 **Coding Plan 订阅额度**。无订阅时预期是「空 `limits`」或某个业务错误码，
  **具体是哪种没有验证过**（无有效 key）。
- **免费体验额度（GLM-5.3 300 万 token/日）、资源包、现金余额都不在这个接口里**；
  智谱也没提供公开的余额查询 API，只能走控制台（费用明细 / 账单页）。
- 因此：**本 provider 对非订阅用户没有价值**，UI 上应当按「报错即整卡隐藏」处理，
  与本项目现有的「Kimi Code 服务不可达时隐藏卡片」一致。

## 待验证清单（开发前必须先拿到有效 key 跑一遍）

1. 无订阅 + 有效普通 API Key 调用时，到底返回**空 limits** 还是**业务错误码**（决定 UI 分支）
2. 普通（按量付费）API Key 能否调用该端点，还是**必须是 Coding Plan 的 Key**
3. 新套餐两条 `TOKENS_LIMIT` 的 `unit`/`number` 真实取值（`3/5` + `6/7` 还是 `6/1`）
4. `nextResetTime` 确认是毫秒（cc-switch 按毫秒处理）
5. 响应是否带任何用量明细（`usageDetails` 结构）

> 验证方式：填真实 key 跑一次上面的 curl，body 会直接给出答案。
> 若届时仍无订阅，则应把这项功能**降级为「不可用则不显示」**，不要硬编码假设。

## 实施计划草案（映射到本项目）

1. `src/shared/types/usage.ts`：新增 Zhipu provider 类型。窗口语义对齐现有 Kimi
   （5h / 周，百分比已用 + 重置时间），额外带 `level`（套餐档位）
2. `src/shared/types/config.ts`：`zhipu: { enabled, apiKey }`
3. `src/main/usage-monitor.ts`：
   - 新增 `fetchZhipu`：`Authorization` **不加 Bearer**（与其它 provider 不同，别复制粘贴）
   - **必须做 body 级成功判定**：`success !== true` 一律当失败，不能只看 `res.ok`
   - 解析纯函数 `parseZhipuTiers`（按 `unit` 分类 + 兜底启发式），抽出来写单测
   - `_safeRun` 走普通路径即可（无需 `resolveToken`，key 是手填的）
4. `src/main/usage-monitor.test.ts`：用本文档的样例 JSON 覆盖
   - 新套餐（两条 TOKENS_LIMIT）
   - 老套餐（一条）
   - `unit` 缺失的兜底
   - `success:false` / `code:401`
   - 两个窗口 resetTime 顺序颠倒的用例（回归 #3036 那类 bug）
5. `src/renderer/src/Settings.vue` + `components/UsageCard.vue`：进度条 + 档位标签
6. `src/main/pairing.ts`：决定是否下发手机端（建议下发，纯 API Key 无额外风险）
7. 安卓端 / `opencode-plugin/` 侧栏：可后续再看

## 已定决策

- **只做国内版**：国际版 `api.z.ai` 路径字段一致，随时可加，不阻塞
- **不做团队版**：需要额外组织/项目 ID，受众小，先留接口
- **不做 model-usage / tool-usage**：字段未公开，先不引不确定性
- **失败即隐藏**：非订阅用户无额度可查，不展示空卡片
- **测试驱动解析**：解析是纯函数，用抓下来的真实 JSON 做 fixture 离线断言，
  不依赖联网（本项目 `*.test.ts` 既有风格）

## 风险

- **未文档化接口**：官方只承诺 Claude Code 插件形态，路径/字段随时可能变。
  需要按「防御式解析 + 认不出就跳过该窗口」写，不要整体失败
- **合规**：套餐条款写明额度仅限官方支持的工具内使用。本项目只**读取**额度不消耗额度，
  但仍是第三方监控，属灰色地带，README 里最好别把它当卖点宣传
- **HTTP 恒 200** 是最容易踩的坑：鉴权失败会被静默当成成功，解析出空数据

## 参考资料

- 官方文档（只讲插件，不讲 HTTP）：https://docs.bigmodel.cn/cn/coding-plan/extension/usage-query-plugin
- 官方插件源码（权威请求形态）：https://github.com/zai-org/zai-coding-plugins
  - `plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs`
- cc-switch 参考实现（含解析规则与踩坑注释）：
  `src-tauri/src/services/coding_plan.rs` → `query_zhipu` / `parse_zhipu_token_tiers` / `classify_zhipu_window`
- 团队版差异：https://github.com/Wei-Shaw/sub2api/issues/6266
- 社区脚本与响应样例：https://github.com/farion1231/cc-switch/issues/1588
- 控制台用量页（人工核对基线）：https://www.bigmodel.cn/coding-plan/personal/usage

## 预估

有 key 可验证的前提下，人工约 0.5～1 人日（含测试）。无 key 则只能写「防御式 + 单测」，
成功路径留给有订阅的用户回归。
