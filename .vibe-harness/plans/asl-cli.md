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

## 实施计划

> **For agentic workers:** 按任务逐个执行，步骤用 checkbox 追踪。每步完成后跑测试再提交。
>
> **Goal:** 构建 `asl-cli`——输出 6 家供应商用量配额的命令行程序（JSON / 终端表格 / --watch），底层抽取共享包 `providers-core`。
>
> **Architecture:** providers-core（CJS dist，file: 依赖）承载全部取数与配置解析；asl-cli（ESM）只做壳：commander 参数解析、chalk 渲染、watch 循环。
>
> **Tech Stack:** TypeScript、tsc、vitest、chalk ^5、commander ^12、Node file: 依赖。
>
> **构建约束（重要）:** providers-core 编译为 **CommonJS**（迁移来的源码是 extensionless 相对导入，ESM 会跑不起来）；asl-cli 是 ESM，源码相对导入**必须带 `.js` 扩展名**（NodeNext）。

---

### Task 1: providers-core 包骨架 + 代码迁移

**Files:**
- Create: `providers-core/package.json`、`providers-core/tsconfig.json`、`providers-core/vitest.config.ts`、`providers-core/.gitignore`
- Create: `providers-core/src/index.ts`（新增的顶层出口，其余文件从 opencode-plugin **复制**，原包不动）
- Copy: `opencode-plugin/src/{types,config,format,config.test,format.test}.ts` → `providers-core/src/`
- Copy: `opencode-plugin/src/providers/*.ts`（含全部 `.test.ts`）→ `providers-core/src/providers/`

- [ ] **Step 1: 创建包文件**

`providers-core/package.json`：
```json
{
  "name": "providers-core",
  "version": "0.1.0",
  "private": true,
  "description": "AI状态监控 用量取数核心：6 家 provider 取数 + 桌面端 config.json 只读解析（供 opencode-plugin / asl-cli 共用）",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```

`providers-core/tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`providers-core/vitest.config.ts`（与 opencode-plugin 相同）：
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

`providers-core/.gitignore`：
```
node_modules/
dist/
```

- [ ] **Step 2: 复制源码（保留原包，pwsh）**

```powershell
New-Item -ItemType Directory -Force providers-core/src/providers | Out-Null
Copy-Item opencode-plugin/src/types.ts, opencode-plugin/src/config.ts, opencode-plugin/src/format.ts, opencode-plugin/src/config.test.ts, opencode-plugin/src/format.test.ts providers-core/src/
Copy-Item opencode-plugin/src/providers/*.ts providers-core/src/providers/
```

- [ ] **Step 3: 新增顶层出口**

`providers-core/src/index.ts`：
```ts
// 共享取数核心的顶层出口：opencode-plugin 与 asl-cli 都从这里取全部公开 API。
export * from './types';
export * from './config';
export * from './format';
export * from './providers/index';
```

- [ ] **Step 4: 安装依赖并跑测试（必须全绿——证明搬迁零行为变化）**

```powershell
cd providers-core; npm install; npm test; npm run build
```
Expected: 原 opencode-plugin 的全部测试（config/format/providers 共 12 个测试文件）通过；`dist/` 生成。

- [ ] **Step 5: Commit**

```bash
git add providers-core
git commit -m "feat: 新增 providers-core 共享用量取数包（自 opencode-plugin 复制迁移）"
```

### Task 2: asl-cli 包骨架

**Files:**
- Create: `asl-cli/package.json`、`asl-cli/tsconfig.json`、`asl-cli/vitest.config.ts`、`asl-cli/.gitignore`、`asl-cli/src/collect.ts`

- [ ] **Step 1: 创建包文件**

`asl-cli/package.json`：
```json
{
  "name": "asl-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "AI状态监控 CLI：6 家供应商用量配额（JSON / 终端表格 / --watch）",
  "bin": { "asl": "./dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "providers-core": "file:../providers-core"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```

`asl-cli/tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "outDir": "dist",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`asl-cli/vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

`asl-cli/.gitignore`：
```
node_modules/
dist/
```

- [ ] **Step 2: 写 collect.ts（取数汇集，单家失败不抛异常，模式对齐 tui.tsx 的 fetchOne）**

`asl-cli/src/collect.ts`：
```ts
import {
  configPath,
  enabledProviders,
  loadConfig,
  type ProviderDefinition,
  type ProviderState,
  type RawAppConfig,
  type Thresholds,
} from 'providers-core';

export interface CollectResult {
  configPath: string;
  /** loadConfig 的错误（文件缺失 / 解析失败 / 结构异常）；null 表示正常 */
  configError: string | null;
  thresholds: Thresholds;
  states: ProviderState[];
}

/** 单家取数 → ProviderState：成功记 windows/balance，失败记 error 文案（与 opencode-plugin tui.tsx fetchOne 一致） */
export async function fetchState(def: ProviderDefinition, raw: RawAppConfig): Promise<ProviderState> {
  const lastUpdated = new Date().toISOString();
  try {
    const result = await def.fetch(raw);
    return {
      id: def.id,
      name: def.name,
      windows: result.windows,
      balance: result.balance,
      error: null,
      lastUpdated,
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '拉取失败';
    return { id: def.id, name: def.name, windows: [], balance: null, error: message, lastUpdated };
  }
}

export async function collectStates(): Promise<CollectResult> {
  const path = configPath();
  const loaded = loadConfig(path);
  if (loaded.error) {
    return { configPath: path, configError: loaded.error, thresholds: loaded.thresholds, states: [] };
  }
  const defs = enabledProviders(loaded.config);
  const states = await Promise.all(defs.map((d) => fetchState(d, loaded.config)));
  return { configPath: path, configError: null, thresholds: loaded.thresholds, states };
}
```

- [ ] **Step 3: 安装依赖（providers-core 需先 build，Task 1 已做）**

```powershell
cd asl-cli; npm install
```
Expected: node_modules 出现，`providers-core` 以 file: 依赖装入。

- [ ] **Step 4: Commit**

```bash
git add asl-cli
git commit -m "feat: asl-cli 包骨架与取数汇集（file: 依赖 providers-core）"
```

### Task 3: JSON 输出（TDD）

**Files:**
- Create: `asl-cli/src/json.ts`
- Test: `asl-cli/src/json.test.ts`

- [ ] **Step 1: 写失败测试**

`asl-cli/src/json.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { buildJson } from './json.js';
import type { ProviderState } from 'providers-core';

const STATE: ProviderState = {
  id: 'kimi',
  name: 'Kimi',
  windows: [{ label: '5h', percent: 52, resetTime: '2026-10-16T15:00:00.000Z' }],
  balance: null,
  error: null,
  lastUpdated: '2026-10-16T12:00:00.000Z',
};

describe('buildJson', () => {
  it('输出 configPath / fetchedAt / providers 三段', () => {
    const json = buildJson('C:/cfg.json', [STATE], undefined, new Date('2026-10-16T12:00:00.000Z'));
    expect(json).toEqual({
      configPath: 'C:/cfg.json',
      fetchedAt: '2026-10-16T12:00:00.000Z',
      providers: [STATE],
    });
  });

  it('config 错误时带 error 字段', () => {
    const json = buildJson('C:/cfg.json', [], 'config.json 读取失败');
    expect(json.error).toBe('config.json 读取失败');
    expect(json.providers).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `cd asl-cli; npm test` → FAIL（找不到 ./json.js）

- [ ] **Step 3: 实现**

`asl-cli/src/json.ts`：
```ts
import type { ProviderState } from 'providers-core';

export interface UsageJson {
  configPath: string;
  fetchedAt: string;
  /** config.json 缺失 / 解析失败时的中文文案 */
  error?: string;
  providers: ProviderState[];
}

export function buildJson(
  configPath: string,
  states: ProviderState[],
  error?: string,
  fetchedAt: Date = new Date(),
): UsageJson {
  const json: UsageJson = { configPath, fetchedAt: fetchedAt.toISOString(), providers: states };
  if (error) json.error = error;
  return json;
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd asl-cli; npm test` → PASS

- [ ] **Step 5: Commit** — `git add asl-cli/src/json.ts asl-cli/src/json.test.ts; git commit -m "feat: asl-cli JSON 输出（--json 管道友好）"`

### Task 4: 终端表格渲染（TDD）

**Files:**
- Create: `asl-cli/src/render.ts`
- Test: `asl-cli/src/render.test.ts`

- [ ] **Step 1: 写失败测试**

`asl-cli/src/render.test.ts`：
```ts
import chalk from 'chalk';
import { beforeEach, describe, expect, it } from 'vitest';
import { bar, renderUsage } from './render.js';
import type { ProviderState } from 'providers-core';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const THRESHOLDS = { warn: 50, danger: 80 };

const OK: ProviderState = {
  id: 'kimi',
  name: 'Kimi',
  windows: [
    { label: '5h', percent: 52, resetTime: '2026-10-16T15:12:00.000Z' },
    { label: '周', percent: 23, resetTime: null },
  ],
  balance: null,
  error: null,
  lastUpdated: null,
};
const BALANCE: ProviderState = {
  id: 'deepseek', name: 'DeepSeek', windows: [],
  balance: { currency: 'USD', total: 12.34 }, error: null, lastUpdated: null,
};
const ERR: ProviderState = {
  id: 'codex', name: 'Codex', windows: [], balance: null,
  error: 'no_token', lastUpdated: null,
};

describe('bar', () => {
  it('按百分比填充', () => {
    expect(bar(50, 10)).toBe('█████░░░░░');
    expect(bar(0, 10)).toBe('░░░░░░░░░░');
    expect(bar(100, 10)).toBe('██████████');
  });
  it('clamp 到 0-100', () => {
    expect(bar(150, 10)).toBe('██████████');
    expect(bar(-5, 10)).toBe('░░░░░░░░░░');
  });
});

describe('renderUsage', () => {
  beforeEach(() => { chalk.level = 0; });

  it('头部带 config 路径', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('AI 状态监控 CLI');
    expect(out).toContain('C:/cfg.json');
  });

  it('首个窗口带名称列，后续窗口缩进；带倒计时', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('Kimi');
    expect(out).toContain('52%');
    expect(out).toContain('23%');
    expect(out).toContain('3h 后重置');
  });

  it('余额型渲染余额', () => {
    const out = renderUsage([BALANCE], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('$12.34');
  });

  it('错误行灰显文案（no_token → 未配置）', () => {
    const out = renderUsage([ERR], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('未配置');
  });

  it('color:true 时阈值上色（warn → 黄）', () => {
    chalk.level = 3; // vitest 非 tty 下 chalk 自动降为 0，须手动开
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW, color: true });
    expect(out).toContain('\u001B[33m');
  });

  it('默认 color:false 无 ANSI', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).not.toContain('\u001B[');
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `cd asl-cli; npm test` → FAIL（找不到 ./render.js）

- [ ] **Step 3: 实现**

`asl-cli/src/render.ts`：
```ts
import chalk from 'chalk';
import {
  clamp,
  displayWidth,
  errorLabel,
  formatCountdown,
  formatMoney,
  formatPercent,
  levelFor,
  padToWidth,
  type Level,
  type ProviderState,
  type Thresholds,
} from 'providers-core';

export interface RenderOptions {
  configPath: string;
  thresholds: Thresholds;
  /** 相对 ms 转绝对用；测试注入固定值保证确定性 */
  now: number;
  /** 默认 false 输出纯文本；true 时按阈值上色 */
  color?: boolean;
}

const BAR_WIDTH = 16;

export function bar(percent: number, width: number = BAR_WIDTH): string {
  const filled = Math.round((clamp(percent) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function paint(level: Level, color: boolean): (text: string) => string {
  if (!color) return (text) => text;
  if (level === 'danger') return chalk.red;
  if (level === 'warn') return chalk.yellow;
  return chalk.green;
}

export function renderUsage(states: ProviderState[], opts: RenderOptions): string {
  const color = opts.color ?? false;
  const lines: string[] = [];
  lines.push(`AI 状态监控 CLI — config: ${opts.configPath}`);
  lines.push('');

  const nameWidth = Math.max(...states.map((s) => displayWidth(s.name)), 4);
  for (const state of states) {
    const nameCol = padToWidth(state.name, nameWidth);
    if (state.error) {
      lines.push(color ? chalk.grey(`${nameCol}  ${errorLabel(state.error)}`) : `${nameCol}  ${errorLabel(state.error)}`);
      continue;
    }
    if (state.balance) {
      lines.push(`${nameCol}  余额 ${formatMoney(state.balance.currency, state.balance.total)}`);
      continue;
    }
    if (state.windows.length === 0) {
      lines.push(`${nameCol}  （无窗口数据）`);
      continue;
    }
    state.windows.forEach((w, i) => {
      const labelCol = i === 0 ? nameCol : ' '.repeat(nameWidth);
      const level = levelFor(w.percent, opts.thresholds);
      const paintText = paint(level, color);
      const countdown = formatCountdown(w.resetTime, opts.now);
      const suffix = countdown ? `${countdown} 后重置` : '';
      const dimSuffix = color && suffix ? chalk.dim(suffix) : suffix;
      lines.push(
        `${labelCol}  ${padToWidth(w.label, 2)}  ${paintText(`[${bar(w.percent)}]`)}  ${paintText(formatPercent(w.percent))}  ${dimSuffix}`,
      );
    });
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd asl-cli; npm test` → PASS

- [ ] **Step 5: Commit** — `git add asl-cli/src/render.ts asl-cli/src/render.test.ts; git commit -m "feat: asl-cli 终端表格渲染（进度条 + 阈值着色）"`

### Task 5: config doctor 命令（TDD）

**Files:**
- Create: `asl-cli/src/doctor.ts`
- Test: `asl-cli/src/doctor.test.ts`

- [ ] **Step 1: 写失败测试**

`asl-cli/src/doctor.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { providerStatuses } from './doctor.js';
import type { RawAppConfig } from 'providers-core';

describe('providerStatuses', () => {
  it('逐家报告 enabled 与凭据状态', () => {
    const config: RawAppConfig = {
      kimi: { enabled: true, token: 'sk-x' },
      volcengine: { enabled: true, accessKey: 'AK', secretKey: 'SK' },
      codex: { enabled: true },
    };
    const list = providerStatuses(config);
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('kimi')).toMatchObject({ enabled: true, credential: '已配置' });
    expect(byId.get('volcengine')).toMatchObject({ enabled: true, credential: '已配置' });
    expect(byId.get('codex')!.credential).toMatch(/^已?配置$/); // 读真实 ~/.codex/auth.json 存在性，不做假设
    expect(byId.get('minimax')).toMatchObject({ enabled: false, credential: '未配置' });
    expect(list).toHaveLength(6);
  });
});
```

（注：codex 凭据探测读真实 `~/.codex/auth.json` 的存在性，单测不断言其值——上面断言字段存在即可。）

- [ ] **Step 2: 跑测试确认失败** → FAIL

- [ ] **Step 3: 实现**

`asl-cli/src/doctor.ts`：
```ts
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, configPath, type RawAppConfig } from 'providers-core';

export interface ProviderStatus {
  id: string;
  name: string;
  enabled: boolean;
  credential: string;
}

/** 各家凭据探测：token 型看 config 字段，火山看 AK/SK，Codex 看 ~/.codex/auth.json 是否存在 */
export function providerStatuses(config: RawAppConfig): ProviderStatus[] {
  const cred = (has: boolean): string => (has ? '已配置' : '未配置');
  return [
    { id: 'kimi', name: 'Kimi', enabled: config.kimi?.enabled === true, credential: cred(!!config.kimi?.token) },
    { id: 'minimax', name: 'MiniMax', enabled: config.minimax?.enabled === true, credential: cred(!!config.minimax?.token) },
    { id: 'volcengine', name: '火山', enabled: config.volcengine?.enabled === true, credential: cred(!!config.volcengine?.accessKey && !!config.volcengine?.secretKey) },
    { id: 'deepseek', name: 'DeepSeek', enabled: config.deepseek?.enabled === true, credential: cred(!!config.deepseek?.token) },
    { id: 'mimo', name: 'MiMo', enabled: config.mimo?.enabled === true, credential: cred(!!config.mimo?.token) },
    { id: 'codex', name: 'Codex', enabled: config.codex?.enabled === true, credential: cred(existsSync(join(homedir(), '.codex', 'auth.json'))) },
  ];
}

export function renderDoctor(configFile: string = configPath()): string {
  const lines: string[] = [];
  const loaded = loadConfig(configFile);
  lines.push(`配置文件：${configFile}`);
  lines.push(`读取状态：${loaded.error ?? '正常'}`);
  lines.push('');
  for (const p of providerStatuses(loaded.config)) {
    lines.push(`${p.name.padEnd(8)}  ${p.enabled ? '已启用' : '未启用'}  ${p.credential}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd asl-cli; npm test` → PASS

- [ ] **Step 5: Commit** — `git add asl-cli/src/doctor.ts asl-cli/src/doctor.test.ts; git commit -m "feat: asl-cli config doctor（路径 + 各家启用/凭据状态）"`

### Task 6: CLI 入口（commander + watch + 退出码）

**Files:**
- Create: `asl-cli/src/watch.ts`、`asl-cli/src/index.ts`

- [ ] **Step 1: 写 watch.ts（无单测——定时循环 IO 层，逻辑已在 render/collect 覆盖）**

`asl-cli/src/watch.ts`：
```ts
export function clearScreen(): void {
  process.stdout.write('\u001B[2J\u001B[1;1H');
}

/** 常驻刷新：立即渲染一次，之后每 intervalSec 原地重绘；Ctrl+C 退出 */
export async function watchLoop(intervalSec: number, render: () => Promise<string>): Promise<void> {
  const run = async (): Promise<void> => {
    clearScreen();
    process.stdout.write((await render()) + '\n');
  };
  await run();
  const timer = setInterval(() => {
    void run();
  }, intervalSec * 1000);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.exit(0);
  });
}
```

- [ ] **Step 2: 写入口 index.ts**

`asl-cli/src/index.ts`：
```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { PROVIDERS, type Thresholds } from 'providers-core';
import { collectStates } from './collect.js';
import { buildJson } from './json.js';
import { renderUsage } from './render.js';
import { renderDoctor } from './doctor.js';
import { watchLoop } from './watch.js';

interface UsageOptions {
  json?: boolean;
  provider?: string;
  watch?: boolean;
  watchInterval: string;
}

const PROVIDER_IDS = PROVIDERS.map((p) => p.id).join(' | ');

async function runUsage(opts: UsageOptions): Promise<number> {
  const { configPath, configError, thresholds, states } = await collectStates();

  if (configError) {
    if (opts.json) {
      process.stdout.write(JSON.stringify(buildJson(configPath, [], configError), null, 2) + '\n');
    } else {
      process.stderr.write(`asl: ${configError}\n路径：${configPath}\n请先在桌面端设置页配置并保存。\n`);
    }
    return 1;
  }

  if (opts.provider && !states.some((s) => s.id === opts.provider)) {
    process.stderr.write(`asl: 未启用的 provider「${opts.provider}」（已启用：${states.map((s) => s.id).join(', ') || '无'}）\n`);
    return 1;
  }
  const filtered = opts.provider ? states.filter((s) => s.id === opts.provider) : states;

  if (opts.watch) {
    const interval = Math.max(5, Number(opts.watchInterval) || 60);
    await watchLoop(interval, async () => {
      const fresh = await collectStates();
      return renderUsage(fresh.states, {
        configPath: fresh.configPath,
        thresholds: fresh.thresholds as Thresholds,
        now: Date.now(),
        color: process.stdout.isTTY === true,
      });
    });
    return 0;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(buildJson(configPath, filtered), null, 2) + '\n');
  } else {
    process.stdout.write(
      renderUsage(filtered, { configPath, thresholds, now: Date.now(), color: process.stdout.isTTY === true }) + '\n',
    );
  }

  const allFailed = states.length > 0 && states.every((s) => s.error !== null);
  return allFailed ? 2 : 0;
}

async function usageAction(opts: UsageOptions): Promise<void> {
  process.exitCode = await runUsage(opts);
}

const program = new Command();
program.name('asl').description('AI状态监控 CLI：6 家供应商用量配额').version('0.1.0');

program
  .command('usage')
  .description('输出用量配额（默认命令）')
  .option('--json', '输出结构化 JSON（无颜色）')
  .option('-p, --provider <id>', `只看一家（${PROVIDER_IDS}）`)
  .option('--watch', '常驻原地刷新')
  .option('--watch-interval <seconds>', '刷新间隔秒数（watch 模式，最小 5）', '60')
  .action(usageAction);

program.command('config').description('显示 config 路径与各家启用/凭据状态').action(() => {
  process.stdout.write(renderDoctor() + '\n');
});

// 无子命令时默认 usage（纯表格）
program.action(() => usageAction({ watchInterval: '60' }));

await program.parseAsync(process.argv);
```

- [ ] **Step 3: 构建并手动验证**

```powershell
cd asl-cli; npm run build
node dist/index.js                # 表格
node dist/index.js usage --json   # JSON
node dist/index.js usage -p kimi  # 单家
node dist/index.js config         # doctor
node dist/index.js usage --watch --watch-interval 10   # 观察两轮后 Ctrl+C
node dist/index.js usage --provider nope   # 退出码 1 + stderr
```
Expected: 表格有内容（本机已配置的家）；JSON 能被 `ConvertFrom-Json` 解析；watch 每 10s 重绘；错误路径 stderr + exitCode 1。

（可选装成全局命令：`npm link` → 之后直接 `asl ...`。）

- [ ] **Step 4: Commit**

```bash
git add asl-cli/src/index.ts asl-cli/src/watch.ts
git commit -m "feat: asl-cli CLI 入口（usage/--json/-p/--watch/config 与退出码）"
```

### Task 7: README + 收尾文档

**Files:**
- Create: `asl-cli/README.md`
- Modify: `AGENTS.md`（sibling projects 表加 asl-cli / providers-core，Commands 表加测试命令）
- Modify: `.vibe-harness/index.md`（asl-cli 行补 history 链接）
- Create: `.vibe-harness/history/asl-cli.md`

- [ ] **Step 1: 写 README**（命令表 + 配置来源说明 + JSON shape 示例 + 退出码表，摘自本 spec）
- [ ] **Step 2: 按 AGENTS.md 发版流程更新文档并提交**
  - `git commit -m "docs: asl-cli / providers-core 说明（AGENTS.md + README + history）"`
  - `git push -u origin cli-dev`

