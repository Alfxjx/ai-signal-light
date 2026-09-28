# opencode 供应商用量侧边栏插件 — 设计

- 日期：2026-09-28
- 状态：待评审
- 目标运行环境：opencode v2.0.14（TUI，CLI 插件）

## 1. 目标

在 opencode **TUI 侧边栏**里显示各家 AI 供应商的用量/配额，凭据**只读**复用本仓库桌面应用的
`%APPDATA%\AI状态监控\config.json`，不再引入第二份配置。

- 位置：`sidebar.content` 插槽**末尾**（内置内容之下）
- 形态：每家一行紧凑展示（窄栏友好）
- v1 范围：**Kimi / MiniMax / DeepSeek / 火山 Coding Plan / MiMo**（即当前 config 中 `enabled === true` 的五家）
- 刷新：启动拉一轮 → 每 5 分钟轮询 → 手动刷新（斜杠命令 + 快捷键）

## 2. 背景与约束

### 2.1 环境事实

| 项 | 值 |
|---|---|
| opencode | v2.0.14 |
| 插件 API | `@opencode/plugin`（V2；`@opencode/plugin/tui` 提供 TUI 能力），npm 上最新 2.0.18 |
| 插件注册点 | `~/.config/opencode/cli.json` 的 `plugins`（CLI-only 插件，远端 server 下也生效） |
| 侧边栏插槽 | `sidebar.content`（另有 `sidebar.footer`、`home.footer.status` 等） |
| 配置来源 | `%APPDATA%\AI状态监控\config.json`（正式版 userData） |
| npm registry | npmmirror（`https://registry.npmmirror.com`） |

`config.json` 的结构定义见 `src/shared/types/config.ts`（`AppConfig`），用量数据类型见
`src/shared/types/usage.ts`。插件需自行解析该文件，**不复用**这两个模块（插件是独立 npm 包）。

### 2.2 当前 config 的实际状态（决定了首屏会长什么样）

- `enabled: true`：kimi、minimax、deepseek、volcengine、mimo
- `enabled: false`：copilot、codex（v1 不实现）
- `mimo.token` 为空 → 显示「未配置」
- `volcengine` 的 `accessKey`/`secretKey` 为空、仅有约一个月前的 `cookie` → 大概率「鉴权失败」
- 五家 `useProxy` 均为 `false` → v1 不做代理转发

## 3. 架构取舍

| 方案 | 做法 | 结论 |
|---|---|---|
| **A（采用）** | 插件目录内自成一套 `fetch` 取数，把主进程已验证的取数与响应映射逻辑**移植**过来，靠同一批单测向量保证行为一致 | 插件可独立存在；代价是约 400 行重复代码 |
| B | 把 `volcengine-sign` 与各家响应映射抽到 `src/shared/usage/*`，主进程与插件共享 | 插件从此依赖仓库相对路径，无法独立成包；主进程用 axios + Electron ConfigStore，共享层需重新设计契约 |
| C | 插件不取数，读桌面应用已有服务 `127.0.0.1:3456/api/status` | 已排除：要求桌面应用常驻 |

**A 的重复代码如何控制**：把响应映射写成纯函数并逐家单测，fixture 直接搬
`src/main/usage-monitor.test.ts` 中的真实响应样本；火山 V4 签名搬官方测试向量。
两边源码互相留注释指路，避免日后只改一边。

## 4. 目录结构

仓库根新建 `opencode-plugin/`（与 `landing/`、`android-app/` 平级，自成 npm 包，**不参与**根
`tsconfig.json` / `vite.config.ts` / 根 vitest）。

```
opencode-plugin/
├── package.json          # name: opencode-usage-sidebar；exports: "." 与 "./tui"
├── tsconfig.json
├── vitest.config.ts
├── README.md             # 本地加载方式、调试笔记、与主进程实现的对应关系
└── src/
    ├── tui.tsx                    # Plugin.define：插槽渲染 + 轮询 + 手动刷新命令
    ├── config.ts                  # 定位并解析 AppConfig（只读）
    ├── config.test.ts
    ├── model.ts                    # 各家结果 → 统一 ProviderView
    ├── format.ts                   # 纯格式化：条形/百分比/倒计时/中日韩宽度对齐/配色
    ├── format.test.ts
    ├── types.ts
    └── providers/
        ├── index.ts                # provider 注册表（id、显示名、取数函数、窗口语义）
        ├── kimi.ts                 + kimi.test.ts
        ├── minimax.ts              + minimax.test.ts
        ├── deepseek.ts             + deepseek.test.ts
        ├── mimo.ts                 + mimo.test.ts
        ├── volcengine.ts           + volcengine.test.ts
        └── volcengine-sign.ts      + volcengine-sign.test.ts   # V4 签名 + 官方向量
```

新增 `.gitignore` 条目：`/opencode-plugin/node_modules`（根 `.gitignore` 的 `/node_modules` 只覆盖根目录）。

## 5. 数据流

```
config.json (只读)
    │  config.ts：定位 → 解析 → 取 enabled 的 provider 配置
    ▼
providers/*：fetchUsage(cfg) ── 每家独立 8s 超时
    ▼
model.ts：归一化为 ProviderView
    ▼
Solid signal ──(每 5 分钟 / 手动)──> sidebar.content 插槽
```

- 每轮刷新用**单飞 promise**：轮询、手动刷新、缓存预热共用同一个 in-flight，不叠加请求。
- 每家独立 `Promise.allSettled`，一家失败不影响其余。

## 6. 配置读取

- 路径：`%APPDATA%\AI状态监控\config.json`
  （等价于 Electron `app.getPath('userData')`，即 `C:\Users\<user>\AppData\Roaming\AI状态监控`）
- 仅支持**正式版**，不读 `-dev`；不通过插件 options 传路径，不做环境变量覆盖。
- **只读**，绝不写回：cookie / CSRF 的续期回写继续由桌面应用独占，避免两边互相踩踏。
- 文件不存在或 JSON 解析失败 → 侧边栏只渲染一行 `config.json 读取失败`，不渲染任何 provider。
- 只渲染 `enabled === true` 的 provider；`token` 为空的渲染为「未配置」（灰），**不静默隐藏**。
- 告警阈值复用文件中的 `thresholds.warn` / `thresholds.danger`（当前 50 / 80）。

## 7. 各家取数规格

| provider | 端点 | 鉴权 | 产出 |
|---|---|---|---|
| Kimi | `GET https://api.kimi.com/coding/v1/usages` | `Authorization: Bearer sk-kimi-…` | 5 小时窗口 + 周窗口 |
| MiniMax | `GET https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains` | `Authorization: Bearer sk-cp-…`；只取 `model_name === 'general'` | 5 小时 + 周（服务端给的是距重置的相对时间） |
| 火山 | `GET https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage` | AK/SK V4 签名优先；cookie + `x-csrf-token` 回退 | session / 周 / 月 |
| DeepSeek | `GET https://api.deepseek.com/user/balance` | `Authorization: Bearer sk-…` | 余额（总额 / 赠送 / 充值） |
| MiMo | `GET https://platform.xiaomimimo.com/api/v1/balance` | 整段控制台 Cookie（`api-platform_serviceToken` / `userId` 等） | 余额（总额 / 赠送 / 付费） |

共同要求：

- 统一带浏览器 UA（沿用主进程做法，避免被厂商风控拒绝 node 客户端）。
- 每家 8 秒超时。
- 火山：AK/SK 齐备走签名通道，缺任一或失败则回退 cookie 通道；cookie 通道需同时校验 HTTP
  status 与响应体里的 `ResponseMetadata.Error`（火山鉴权失败常返回 HTTP 200 + 业务错误码）。

## 8. UI 规格

```
用量                    刷新 刚刚
Kimi
  5h   18%  27m
  周   31%   3d
MiniMax
  5h    1%    1h
  周    2%    3d
火山
  5h   13%    4h
  周    4%    2d
  月    2%   12d
DeepSeek  ¥29.06
MiMo      ¥33.06
```

规则：

- **每家多行展开**：百分比型 provider 先出一行**标题行**（只有名称），随后**每个周期各占一行**，
  内容为「  标签  百分比  倒计时」。
- **不做进度条**：只给百分比数字（2026-09-28 评审改版，原设计的 5 格 `█░` 条形已去掉）。
- **百分比语义**：全部是「已用 %」（Kimi / 火山直接用接口值；MiniMax 是 `100 - remaining`）。
- **对齐**：窗口标签固定 2 列显示宽度（`5h` / `周` / `月`），百分比右对齐 4 列；
  名称按终端**显示宽度**处理（中日韩字符算 2 列）。标签或名称超宽时截断加省略号。
- **倒计时**：每个窗口行尾带「距重置」最大单位（`27m` / `4h` / `3d`）；接口没给重置时间则省略。
- **配色**：每个窗口行按**自己的**已用 % 着色；**标题行取最紧（已用 % 最高）的那个窗口**的档位，
  方便一眼扫出哪家最危险。`< warn` 绿、`≥ warn` 黄、`≥ danger` 红。
- **余额型**（DeepSeek / MiMo）：只有一项数据，**不套标题行**，单行「名称  金额」，
  货币符号由 API 返回的 currency 决定，缺省 2 位小数。
- **错误态**：单行「名称  － 原因」，`未配置`（灰）/ `鉴权失败`（红）/ `超时` / `离线`。
- **表头**：`用量` + 「距上次刷新时间」（如 `刷新 2m前`）；首屏拉取中显示 `拉取中…`。
- **手动刷新**：斜杠命令 `/usage`（执行即刷新）+ 快捷键（建议 `ctrl+alt+u`，可在 `cli.json` 覆盖）；
  刷新完成后弹 toast 汇总，如 `已刷新 5 家（2 家失败）`。

## 9. 刷新与缓存

- `setup` 内立即拉一轮。
- 之后每 5 分钟一轮（与 config.json 的 `intervalMinutes` 解耦）。
- 结果落 `context.storage.store(...)`：重启后先用缓存渲染并标注 `缓存 12m前`，同时后台刷新。
- 单飞：轮询与手动刷新复用同一个 in-flight promise。
- 失败退避：单个 provider 连续失败则跳过后续轮次并指数退避（2× → 4× …），上限 30 分钟；
  任一成功后清零。
- `setup` 返回 cleanup：清 interval、abort in-flight。

## 10. 加载与注册

`~/.config/opencode/cli.json` 的 `plugins` 数组追加本目录（`opencode.jsonc` 里那个 legacy
`plugin` 数组**不动**，其中挂着的 `opencode-tokenwatch` 一并保持原样）：

```jsonc
{
  "plugins": [
    "opencode-tokenwatch",
    "file:///C:/Users/<user>/Documents/kimi/Workspaces/ai-signal-light/opencode-plugin"
  ]
}
```

- Windows 下路径书写形式（绝对路径 vs `file:///`）文档未明确，**实现时实测**。
- 兜底方案：在 `~/.config/opencode/plugins/usage-sidebar/` 放 `index.ts` + `tui.ts` 两行
  re-export，指向仓库内实现（opencode 会自动发现 `<global-config>/plugins/<name>/`）。

## 11. 测试

Vitest，colocated `*.test.ts`，与仓库既有约定一致（`npm test` 在插件目录内执行）：

- `config.test.ts`：正常解析、字段缺失、JSON 损坏、空 token、`enabled` 过滤。
- `providers/*.test.ts`：真实响应 → metric 映射；畸形/空响应不抛异常。
- `volcengine-sign.test.ts`：官方 V4 签名测试向量（与主进程同一批）。
- `format.test.ts`：中日韩宽度对齐、阈值配色、倒计时、余额格式、超宽截断。

不打真实接口（无网络单测）。

## 12. 非目标（v1）

- Copilot / Codex 两个 provider
- 代理转发（`useProxy`）——五家当前均为 `false`
- cookie / CSRF 续期与写回 `config.json`
- opencode 桌面版 / Web 版 UI
- 发布到 npm
- 读 `-dev` 配置、环境变量覆盖路径

## 13. 风险与验证点

| # | 风险 | 处理 |
|---|---|---|
| 1 | `cli.json` 中本地目录的路径语法未实测 | 第一步只做「加载成功即弹 toast」的最小插件，通路验证通过再写功能；兜底 re-export 方案 |
| 2 | 本地插件在无 `node_modules` 时能否解析 `solid-js` / `@opencode/plugin/tui` | 实测；失败则本地安装（npmmirror 已确认可达 `@opencode/plugin@2.0.18`） |
| 3 | 侧边栏实际宽度未知，可能不足 35 列 | 按 35 列设计，窄栏时截断名称 |
| 4 | 5 分钟 × 5 家 ≈ 60 请求/小时，可能触发风控 | 单飞 + 缓存 + 失败退避；不做更激进的短轮询 |
| 5 | 移植代码与主进程实现漂移 | fixture 同源 + 双向注释指路 |

## 14. 实现顺序（概要）

1. 最小插件 + cli.json 注册，验证加载与 `sidebar.content` 渲染通路（toast + 一行静态文本）
2. `config.ts` + `format.ts` + `model.ts`（纯函数，先单测）
3. 五家 provider 取数与映射（逐家：实现 → 单测 → 接入）
4. `tui.tsx` 组装：轮询、缓存、手动刷新命令、错误态
5. README 与 `.vibe-harness/` 记录
