# asl-cli — AI状态监控 命令行版（用量配额）

- 时间：2026-10-16
- 分支：`cli-dev`（基于 main）
- 状态：设计完成，待实施

## 背景与目标

仓库已有两套「用量配额」消费端：桌面端主面板（Electron）和 opencode-plugin 侧边栏。本任务新增第三个独立消费端 **asl-cli**：一个命令行程序，`asl --<指令>` 输出各供应商用量配额，支持两种输出形态——结构化 JSON（脚本/管道用）和终端可视化表格（人眼看），可选 `--watch` 常驻刷新。

**范围只做用量配额**（6 家：Kimi / MiniMax / 火山 / DeepSeek / MiMo / Codex），不做 Agent 状态（Claude 项目活跃度 / Kimi web / 本地工具忙态）。

## 关键决策（已与用户确认）

| 决策点 | 结论 |
|--------|------|
| 数据范围 | 只做用量配额 |
| TUI 形态 | 一次性渲染 + 可选 `--watch`，不做完整交互式 TUI |
| 配置来源 | 只读桌面端 config.json（对齐 opencode-plugin），不新增配置面 |
| 代码组织 | 抽共享包 providers-core，asl-cli 依赖它；opencode-plugin 本任务不动，迁移另开任务 |
| 渲染技术 | 小库辅助（chalk + commander），不搞零依赖也不上 Ink |

## 方案选择记录

- **A（选定）**：先抽 providers-core，asl-cli 第一天就用；opencode-plugin 迁移因 opencode 加载器对 `file:` 依赖的解析能力未知，单独验证后另做任务
- B：一次性三包改造 —— 风险集中，opencode 加载器不兼容会卡死在半路，否决
- C：asl-cli 相对路径 import opencode-plugin —— 私有包互相耦合，否决

## 包结构

```
providers-core/                  # 新增：共享取数核心（private，tsc 构建出 dist/，ESM）
├── package.json                 # name: "providers-core"
├── tsconfig.json
└── src/
    ├── types.ts                 # ProviderId / WindowView / BalanceView / ProviderResult / ProviderState
    ├── config.ts                # 桌面端 config.json 只读解析（从 opencode-plugin 迁来）
    ├── format.ts                # 百分比/倒计时/货币格式化（迁）
    ├── providers/
    │   ├── index.ts             # PROVIDERS 定义 + enabledProviders（迁）
    │   ├── http.ts              # 共用 fetch（迁）
    │   ├── kimi/minimax/volcengine/deepseek/mimo/codex.ts（迁）
    │   └── volcengine-sign.ts   # 火山 V4 签名（迁）
    └── *.test.ts                # 全部测试文件一并迁移，vitest（必须原样通过）

asl-cli/                         # 新增：CLI 壳（private）
├── package.json                 # bin: { "asl": "./dist/index.js" }
│                                # deps: providers-core(file:../providers-core), chalk, commander
└── src/
    ├── index.ts                 # 入口：commander 解析，分发到 render / json / watch / config
    ├── render.ts                # ProviderState[] → 终端文本（纯函数，可测）
    ├── json.ts                  # ProviderState[] → JSON 输出对象（纯函数，可测）
    └── watch.ts                 # watch 循环：定时取数 + ANSI 原地重绘

opencode-plugin/                 # 本任务不动（仍持有一份旧拷贝，迁移另开任务）
```

## 数据流

```
config.json（只读）→ providers-core.config 解析 RawAppConfig
    → enabledProviders 过滤 enabled===true
    → 并发 fetch 六家（每家内部自带鉴权；Codex 自动读 + 刷新 ~/.codex/auth.json）
    → ProviderState[]（单家失败写 error 字段，不抛异常）
    → 两条出口：render.ts（TUI）/ json.ts（JSON）
```

## 命令面

| 命令 | 行为 |
|------|------|
| `asl` / `asl usage` | 渲染所有已启用 provider 的表格，渲染完退出 |
| `asl usage --json` | stdout 出 JSON，无颜色 |
| `asl usage -p <id>` | 单家过滤（可组合 --json，如 `asl usage -p kimi --json`） |
| `asl usage --watch` | 常驻，默认 60s 原地刷新（ANSI 清屏重绘），`--watch-interval <秒>` 可调，Ctrl+C 退出 |
| `asl config` | doctor：显示 config.json 实际路径 + 各家 enabled / 凭据状态 |

### JSON 输出 shape

```json
{
  "configPath": "C:\\Users\\cari\\AppData\\Roaming\\AI状态监控\\config.json",
  "fetchedAt": "2026-10-16T12:00:00.000Z",
  "providers": [
    { "id": "kimi", "name": "Kimi", "windows": [{ "label": "5h", "percent": 52, "resetTime": "..." }], "balance": null, "error": null, "lastUpdated": "..." }
  ]
}
```

`providers` 元素即 providers-core 的 `ProviderState`（windows / balance / error / lastUpdated）。

### TUI 草样

```
AI 状态监控 CLI — config: %APPDATA%\AI状态监控\config.json

Kimi       5h  [████████░░░░░░░░]  52%   3h12m 后重置
           周  [████░░░░░░░░░░░░]  23%
MiniMax    5h  [██░░░░░░░░░░░░░░]  12%   4天后重置
DeepSeek   余额 $12.34
Codex      5h  [██████░░░░░░░░░░]  38%
```

- 进度条手写（一行 `[█████░░░] 62%`），chalk 上色
- 颜色阈值：`< warn` 绿 / `warn~danger` 黄 / `≥ danger` 红，阈值读 config 各家的 warn/danger 配置
- `error` 非空 → 灰色一行（`no_token` 显示「未配置」，其余显示错误文案），**不静默隐藏**

## 错误处理与退出码

| 情况 | 行为 | 退出码 |
|------|------|--------|
| config.json 不存在 | stderr 提示路径 + 指引（去桌面端设置页配置） | 1 |
| 单家取数失败 | 该行灰显错误文案，其余照常渲染 | 0 |
| 全部启用家都失败 | 正常渲染（每行都是错误文案） | 2 |
| --json 模式 | stdout 纯 JSON（无颜色、无表格装饰） | 同上规则 |

## 测试与验证

- **providers-core**：vitest，opencode-plugin 迁移来的全部测试原样通过（证明搬迁零行为变化）
- **asl-cli**：vitest 测 render.ts / json.ts / 参数解析（纯函数）；fetch 层不测（core 已覆盖）
- **手动验证**：`asl`、`asl usage --json`（管道 jq）、`asl usage -p kimi`、`asl usage --watch`、config 缺失路径、`asl config`
- 根目录 `npm test` 不覆盖这两个新包（对齐 opencode-plugin 的既有约定）

## 明确不做（YAGNI）

- 不做完整交互式 TUI（无按键刷新/视图切换）
- 不做自有配置管理（无 `asl set` / `asl init`）
- 不做 Agent 状态输出
- 不发布 npm（private）

## 实施顺序草案

1. 新建 `providers-core/`，从 opencode-plugin 迁移代码 + 测试，跑绿
2. 新建 `asl-cli/`，实现 usage（表格 + JSON）→ config（doctor）→ watch
3. `npm link` / 直接 `node dist/index.js` 验证手动用例
4. 更新 AGENTS.md + `.vibe-harness/history/asl-cli.md` + index.md，提交推送
