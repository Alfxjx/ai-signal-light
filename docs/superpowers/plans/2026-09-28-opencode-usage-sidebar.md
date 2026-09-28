# opencode 供应商用量侧边栏插件 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 opencode TUI 侧边栏显示 Kimi / MiniMax / 火山 Coding Plan / DeepSeek / MiMo 五家用量，凭据只读 `%APPDATA%\AI状态监控\config.json`。

**Architecture:** 仓库根新增独立 npm 包 `opencode-plugin/`，以 CLI 插件形式注册到 `~/.config/opencode/cli.json`。`setup()` 里起 5 分钟轮询（单飞 + 失败退避），把结果写进 `context.storage.store` 的持久化快照，`sidebar.content` 插槽把它渲染成每家一行。取数逻辑从 `src/main/usage-monitor.ts` + `src/main/volcengine-sign.ts` 移植成纯 `fetch` 版本。

**Tech Stack:** TypeScript · Bun（opencode 运行时）· `@opencode/plugin/tui` 2.0.14 · `@opentui/solid` 0.5.10 · solid-js 1.9.15 · Vitest 3

**设计文档:** `docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md`

**相对 spec 的两处简化（已同步回 spec）：**

1. 去掉 `src/model.ts` —— 各家归一化直接在各 provider 模块内完成，窗口选择与阈值判定放 `format.ts`。
2. 去掉 `src/providers/index.ts` 之外的「provider 注册表抽象层」，注册表就是一个数组常量。

---

## 已核验的事实（动手前不需要重新确认）

| 项 | 值 |
|---|---|
| opencode | v2.0.14（`D:\apps\node\node_global\node_modules\@opencode\cli\bin\opencode.exe`） |
| 插件 API 包 | `@opencode/plugin`，V2 类型定义实测取自 2.0.14 |
| TUI 入口 | `import { Plugin } from '@opencode/plugin/tui'` → `Plugin.define({ id, setup })` |
| ⚠️ `Context` 类型 | **不是** `@opencode/plugin/tui` 的顶层导出，只有 `Plugin.Context`。`setup(context)` 靠 `Plugin.define` 的上下文推断拿类型，**不要写 `import type { Context } from '@opencode/plugin/tui'`**（已实测：会报 TS2305） |
| setup 返回值 | `Cleanup = () => void \| Promise<void>` |
| 插槽 | `context.ui.slot({ append: 'sidebar.content', render: ({ sessionID }) => JSX })`，返回注销函数 |
| 持久化 | `context.storage.store<T>('k', { initial: v })` → `[Store<T>, (mutation) => Promise<void>]`（solid-js/store，响应式 + 跨重启 + 跨实例同步） |
| 主题 token | `context.theme.text.base / .muted`、`context.theme.text.feedback.{success,warning,error,info}.base`，类型是 `RGBA` |
| `text` 元素 | `fg?: RGBA` —— 主题 token 可直接传 |
| 快捷键 | `context.keymap.layer(() => ({ mode, commands, bindings }))`；`run(input?, event?)` |
| toast | `context.ui.toast.show({ message, variant, duration })` |
| registry | npmmirror；`@opencode/plugin@2.0.14` 可装 |
| 安装注意 | `@opencode/theme` + `@opentui/*` + `solid-js` **必须加 `--legacy-peer-deps`**，否则 ERESOLVE（已实测） |
| 插件注册点 | **全局发现目录** `~/.config/opencode/plugins/<name>/tui.ts`（已实测生效） |
| ⚠️ `cli.json` 路径条目 | `plugins` 里写本地路径**不会被加载且无任何日志**。已实测失败的三种写法：`file:///C:/…`、裸绝对路径 `C:/…`、补上 `"."` 主入口后重试。**不要用这条路** |

**移植来源对照（改动时必须两边一起改）：**

| 新文件 | 来源 |
|---|---|
| `src/providers/volcengine-sign.ts` | `src/main/volcengine-sign.ts` |
| `src/providers/kimi.ts` | `src/main/usage-monitor.ts` 的 `mapKimiUsages` / `calcPercent` / `fetchKimi` |
| `src/providers/minimax.ts` | 同上 `fetchMiniMax` 内的映射 |
| `src/providers/deepseek.ts` | 同上 `mapDeepseekBalance` / `fetchDeepseek` |
| `src/providers/volcengine.ts` | 同上 `fetchVolcengineByAksk` / `fetchVolcengineByCookie` / `mapVolcengineUsage` |
| `src/providers/mimo.ts` | 同上 `mapMimoBalance` 及其 `MIMO_*` 键表 / `fetchMimo` |
| 单测 fixture | `src/main/usage-monitor.test.ts`、`src/main/volcengine-sign.test.ts` |

**语义坑（务必保持）：**

- **MiniMax 返回的是「剩余 %」**，已用 = `100 - remaining`（`useUsageState.ts:206`）。Kimi / 火山的 `percent` 本身就是已用 %。
- 阈值判定用**严格大于**：`percent > danger` → 红，`percent > warn` → 黄（`useUsageState.ts:134-138`）。
- 火山鉴权失败常返回 **HTTP 200 + `ResponseMetadata.Error`**，必须同时看 body 里的错误码，不能只看 status。
- 火山 AK/SK 通道若响应缺 `session/weekly/monthly` 任一一档，**抛错回退 cookie**，不要展示 0。

---

## 文件结构

```
opencode-plugin/
├── package.json                      # 独立包；exports 只有 "./tui"
├── tsconfig.json                     # jsx: preserve + jsxImportSource: @opentui/solid
├── vitest.config.ts
├── README.md                         # 本地加载方式、调试、与主进程实现的对应关系
└── src/
    ├── tui.tsx                       # 唯一入口：setup / 轮询 / 插槽渲染 / 命令
    ├── types.ts                      # ProviderId / WindowView / BalanceView / ProviderState
    ├── config.ts     + config.test.ts      # 只读解析 AppConfig
    ├── format.ts     + format.test.ts      # 纯格式化（宽度/倒计时/金额/配色/多行展开）
    └── providers/
        ├── http.ts   + http.test.ts        # fetch 封装 + 本地化错误
        ├── kimi.ts   + kimi.test.ts
        ├── minimax.ts + minimax.test.ts
        ├── deepseek.ts + deepseek.test.ts
        ├── mimo.ts   + mimo.test.ts
        ├── volcengine.ts + volcengine.test.ts
        ├── volcengine-sign.ts + volcengine-sign.test.ts
        └── index.ts                        # PROVIDERS 注册表
```

另外修改：

- `.gitignore` —— 追加 `/opencode-plugin/node_modules`
- `~/.config/opencode/plugins/usage-sidebar/tui.ts` —— 全局发现目录的 re-export stub（**不要**改 `cli.json`）

---

## Task 1: 脚手架 + 最小插件跑通加载

先证明「opencode 能加载这个目录并渲染到勿边栏」，再写任何真功能。**这是本计划唯一有真实未知的一步**，所以放在最前面。

**Files:**
- Create: `opencode-plugin/package.json`
- Create: `opencode-plugin/tsconfig.json`
- Create: `opencode-plugin/vitest.config.ts`
- Create: `opencode-plugin/src/tui.tsx`
- Modify: `.gitignore`
- Create: `C:\Users\cari\.config\opencode\plugins\usage-sidebar\tui.ts`（全局发现目录 stub）

- [x] **Step 1: 创建 `opencode-plugin/package.json`**

```json
{
  "name": "opencode-usage-sidebar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "opencode TUI 侧边栏：显示 AI 供应商用量（复用 AI状态监控 的 config.json）",
  "exports": {
    "./tui": "./src/tui.tsx"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@opencode/plugin": "2.0.14",
    "@opencode/theme": "2.0.14",
    "@opentui/core": "0.5.10",
    "@opentui/solid": "0.5.10",
    "@types/node": "^20.0.0",
    "solid-js": "1.9.15",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```

- [x] **Step 2: 创建 `opencode-plugin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["node"],
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vitest.config.ts"]
}
```

- [x] **Step 3: 创建 `opencode-plugin/vitest.config.ts`**

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

- [x] **Step 4: 创建最小 `opencode-plugin/src/tui.tsx`**

```tsx
import { Plugin } from '@opencode/plugin/tui';

export default Plugin.define({
  id: 'ai-signal-light.usage',
  setup(context) {
    context.ui.toast.show({
      message: `用量侧边栏插件已加载（opencode ${context.app.version}）`,
      variant: 'success',
      duration: 4000,
    });

    const unclaim = context.ui.slot({
      append: 'sidebar.content',
      render: () => <text fg={context.theme.text.muted}>用量插件占位</text>,
    });

    return () => unclaim();
  },
});
```

- [x] **Step 5: 安装依赖（必须加 `--legacy-peer-deps`）**

在仓库根执行：

```powershell
Set-Location opencode-plugin; npm install --legacy-peer-deps --no-audit --no-fund
```

Expected: `added N packages`，退出码 0，`opencode-plugin/node_modules/@opencode/plugin` 存在。

若报 ERESOLVE：确认用了 `--legacy-peer-deps`。

- [x] **Step 6: 类型检查 + 空测试跑通**

```powershell
Set-Location opencode-plugin; npm run typecheck; npm test
```

Expected: typecheck 无输出（退出码 0）；`npm test` 因为还没有测试文件而提示无测试，退出码 0（`vitest.config.ts` 里已开 `passWithNoTests`）。

- [x] **Step 7: 用全局发现目录注册插件（不要用 cli.json）**

> ⚠️ **已实测（opencode 2.0.14）：`cli.json` 的 `plugins` 里写本地路径不会被加载，而且一条错误日志都不打。**
> 试过且失败的三种写法：`"file:///C:/.../opencode-plugin"`、`"C:/Users/cari/.../opencode-plugin"`、
> 以及给包补上 `"."` 主入口（`exports` 同时含 `"."` 与 `"./tui"`）后再试一次。
> 唯一有效的方式是**全局插件发现目录** `<global-config>/plugins/<name>/`（已用落盘追踪实证 `setup()` 被调用）。

创建 `C:\Users\cari\.config\opencode\plugins\usage-sidebar\tui.ts`，内容就一行 re-export：

```ts
export { default } from '../../../../Documents/kimi/Workspaces/ai-signal-light/opencode-plugin/src/tui.tsx';
```

- 该目录被 opencode 自动发现，**不需要**写进 `cli.json` 或 `opencode.jsonc`。
- `cli.json` **保持原样**（`plugins` 里只有 `opencode-tokenwatch`），一个字都不要改。
- 这个 stub 在仓库外、不受版本控制 → 内容必须原样记进 README（Task 8）。
- 运行时依赖仍来自**仓库里的** `opencode-plugin/node_modules`：stub import 的文件在这个目录树内，
  Bun 从它向上解析 `@opencode/plugin/tui` 与 `solid-js`。所以 `npm install` 是**运行时前提**，不只是开发前提。

- [x] **Step 8: 验证加载通路**

**第一步：非交互验证（推荐先做这个，不用人盯 TUI）**

临时在 `opencode-plugin/src/tui.tsx` 里加落盘追踪 —— 文件顶部加 `import { appendFileSync } from 'node:fs';`，
`setup(context)` 的第一行加：

```ts
appendFileSync(
  'C:\\Users\\cari\\AppData\\Local\\Temp\\opencode\\usage-sidebar-load.log',
  `${new Date().toISOString()} setup-ran\n`,
);
```

opencode 会监听 `~/.config/opencode`，配置或插件目录一变就自动 reconcile，所以不用重启也能触发：

```powershell
Remove-Item "$env:TEMP\opencode\usage-sidebar-load.log" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 12
Get-Content "$env:TEMP\opencode\usage-sidebar-load.log"
```

Expected: 出现一行或多行 `... setup-ran`（每个 CLI 进程一行）。**出现就证明加载通路打通了。**

验完**删掉这两句诊断代码**（`appendFileSync` 的 import 与调用），再跑 `npm run typecheck` 确认仍为 0。

**第二步：人工验证**

```powershell
opencode
```

Expected: 出现 toast「用量侧边栏插件已加载（opencode v2.0.14）」；进入任意会话（终端足够宽，`session.sidebar: auto` 会展示侧边栏）后，侧边栏内出现灰字「用量插件占位」。

**如果没出现**，按顺序排查：

1. 先做第一步的非交互验证 —— 它能区分「插件压根没加载」和「加载了但插槽没渲染」。
2. trace 文件没出现 → 检查 `~/.config/opencode/plugins/usage-sidebar/tui.ts` 存在、且 re-export 指向真实文件。
3. 看 `~/.local/share/opencode/log/opencode.log`，过滤 `plugin` 与 `level=WARN|level=ERROR`。
4. trace 出现但插槽没文本 → 问题在插槽名（`sidebar.content`）或渲染层。

- [x] **Step 9: 追加 `.gitignore` 条目**

在仓库根 `.gitignore` 末尾追加：

```
/opencode-plugin/node_modules
```

- [x] **Step 10: 提交**

```powershell
git add .gitignore opencode-plugin
git commit -m "feat(opencode-plugin): 脚手架与最小侧边栏插件，验证加载通路"
```

---

## Task 2: `config.ts` —— 只读解析 AppConfig

**Files:**
- Create: `opencode-plugin/src/config.ts`
- Test: `opencode-plugin/src/config.test.ts`

- [x] **Step 1: 写失败测试**

`opencode-plugin/src/config.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS, loadConfig, parseThresholds } from './config';

function writeConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'usage-cfg-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, content, 'utf8');
  return file;
}

describe('loadConfig', () => {
  it('解析正常配置并取出阈值', () => {
    const file = writeConfig(JSON.stringify({
      kimi: { token: 'sk-kimi-x', enabled: true },
      thresholds: { warn: 40, danger: 90 },
    }));
    const loaded = loadConfig(file);
    expect(loaded.error).toBeNull();
    expect(loaded.config.kimi?.token).toBe('sk-kimi-x');
    expect(loaded.thresholds).toEqual({ warn: 40, danger: 90 });
  });

  it('容忍 UTF-8 BOM', () => {
    const file = writeConfig('\uFEFF' + JSON.stringify({ deepseek: { token: 'sk-y', enabled: true } }));
    const loaded = loadConfig(file);
    expect(loaded.error).toBeNull();
    expect(loaded.config.deepseek?.token).toBe('sk-y');
  });

  it('文件不存在时返回错误文案而不是抛出', () => {
    const loaded = loadConfig(join(tmpdir(), 'definitely-missing-config.json'));
    expect(loaded.error).toBe('config.json 读取失败');
    expect(loaded.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('JSON 损坏时返回错误文案而不是抛出', () => {
    const loaded = loadConfig(writeConfig('{ not json'));
    expect(loaded.error).toBe('config.json 解析失败');
  });

  it('顶层是数组时视为结构异常', () => {
    const loaded = loadConfig(writeConfig('[1,2,3]'));
    expect(loaded.error).toBe('config.json 结构异常');
  });

  it('缺 thresholds 时回落到默认值', () => {
    const loaded = loadConfig(writeConfig('{}'));
    expect(loaded.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe('parseThresholds', () => {
  it('非数字阈值回落默认值', () => {
    expect(parseThresholds({ thresholds: { warn: 'abc' as unknown as number } }))
      .toEqual({ warn: DEFAULT_THRESHOLDS.warn, danger: DEFAULT_THRESHOLDS.danger });
  });
});
```

- [x] **Step 2: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/config.test.ts
```

Expected: FAIL —— 无法解析 `./config`。

- [x] **Step 3: 实现 `config.ts`**

```ts
// 只读解析桌面应用（AI状态监控）的 config.json。
// 契约来源：src/shared/types/config.ts，但插件不 import 它（独立 npm 包）。
// 本文件绝不写回文件 —— cookie / CSRF 的续期回写由桌面应用独占，避免互相踩踏。

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RawProviderConfig {
  token?: string;
  enabled?: boolean;
  useProxy?: boolean;
}

export interface RawVolcengineConfig {
  accessKey?: string;
  secretKey?: string;
  cookie?: string;
  csrfToken?: string;
  enabled?: boolean;
}

export interface RawAppConfig {
  kimi?: RawProviderConfig;
  minimax?: RawProviderConfig;
  deepseek?: RawProviderConfig;
  mimo?: RawProviderConfig;
  volcengine?: RawVolcengineConfig;
  thresholds?: { warn?: number; danger?: number };
}

export interface Thresholds {
  warn: number;
  danger: number;
}

export interface LoadedConfig {
  config: RawAppConfig;
  thresholds: Thresholds;
  /** null 表示读取成功；否则是可直接渲染的中文文案 */
  error: string | null;
}

export const DEFAULT_THRESHOLDS: Thresholds = { warn: 50, danger: 80 };

/** %APPDATA%\AI状态监控\config.json（正式版 userData，只读） */
export function configPath(): string {
  const appData = process.env.APPDATA?.trim()
    ? process.env.APPDATA.trim()
    : join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'AI状态监控', 'config.json');
}

export function parseThresholds(raw: RawAppConfig): Thresholds {
  const warn = Number(raw.thresholds?.warn);
  const danger = Number(raw.thresholds?.danger);
  return {
    warn: Number.isFinite(warn) ? warn : DEFAULT_THRESHOLDS.warn,
    danger: Number.isFinite(danger) ? danger : DEFAULT_THRESHOLDS.danger,
  };
}

export function loadConfig(path: string = configPath()): LoadedConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 读取失败' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 解析失败' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 结构异常' };
  }

  const config = parsed as RawAppConfig;
  return { config, thresholds: parseThresholds(config), error: null };
}
```

- [x] **Step 4: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/config.test.ts
```

Expected: 7 passed。

- [x] **Step 5: 提交**

```powershell
git add opencode-plugin/src/config.ts opencode-plugin/src/config.test.ts
git commit -m "feat(opencode-plugin): 只读解析应用 config.json"
```

---

## Task 3: `types.ts` + `format.ts` —— 纯格式化

**Files:**
- Create: `opencode-plugin/src/types.ts`
- Create: `opencode-plugin/src/format.ts`
- Test: `opencode-plugin/src/format.test.ts`

- [x] **Step 1: 先写 `opencode-plugin/src/types.ts`**

```ts
export type ProviderId = 'kimi' | 'minimax' | 'volcengine' | 'deepseek' | 'mimo';

/** 百分比型窗口。percent 一律是「已用 %」（越接近 100 越危险） */
export interface WindowView {
  label: '5h' | '周' | '月';
  percent: number;
  /** Kimi 给 ISO 绝对时间；MiniMax 给「距重置的毫秒数」；火山给秒级时间戳转成的 ISO */
  resetTime: string | null;
}

export interface BalanceView {
  currency: string | null;
  total: number;
}

/** 单家取数结果：要么给 windows，要么给 balance */
export interface ProviderResult {
  windows: WindowView[];
  balance: BalanceView | null;
}

export interface ProviderState {
  id: ProviderId;
  name: string;
  windows: WindowView[];
  balance: BalanceView | null;
  /** null 表示成功；否则是可直接渲染的中文文案。'no_token' 由 format.errorLabel 转成「未配置」 */
  error: string | null;
  lastUpdated: string | null;
}
```

- [x] **Step 2: 写失败测试**

`opencode-plugin/src/format.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  displayWidth,
  errorLabel,
  formatCountdown,
  formatHeader,
  formatMoney,
  formatPercent,
  formatProviderLines,
  levelFor,
  padToWidth,
  pickPrimary,
  truncateToWidth,
} from './format';
import type { ProviderState } from './types';

const THRESHOLDS = { warn: 50, danger: 80 };

describe('displayWidth / padToWidth / truncateToWidth', () => {
  it('CJK 算 2 列，ASCII 算 1 列', () => {
    expect(displayWidth('Kimi')).toBe(4);
    expect(displayWidth('火山')).toBe(4);
    expect(displayWidth('DeepSeek')).toBe(8);
  });

  it('按显示宽度补齐', () => {
    expect(padToWidth('火山', 8)).toBe('火山    ');
    expect(padToWidth('MiniMax', 8)).toBe('MiniMax ');
    expect(padToWidth('Kimi', 8)).toBe('Kimi    ');
  });

  it('超宽时截断并加省略号，总宽度不超过目标', () => {
    expect(displayWidth(truncateToWidth('DeepSeek', 6))).toBeLessThanOrEqual(6);
    expect(truncateToWidth('DeepSeek', 6)).toBe('DeepS…');
    expect(truncateToWidth('火山引擎', 5)).toBe('火山…');
  });

  it('宽度不足时返回空串，不陷入死循环', () => {
    expect(truncateToWidth('火山', 0)).toBe('');
    expect(truncateToWidth('Kimi', -1)).toBe('');
  });
});

describe('formatPercent / levelFor', () => {
  it('百分比四舍五入并夹到 0-100', () => {
    expect(formatPercent(62.4)).toBe('62%');
    expect(formatPercent(-5)).toBe('0%');
    expect(formatPercent(140)).toBe('100%');
  });

  it('阈值用严格大于判定', () => {
    expect(levelFor(50, THRESHOLDS)).toBe('fresh');
    expect(levelFor(51, THRESHOLDS)).toBe('warn');
    expect(levelFor(80, THRESHOLDS)).toBe('warn');
    expect(levelFor(81, THRESHOLDS)).toBe('danger');
  });
});

describe('formatCountdown', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it('绝对时间按 天 / 小时 / 分钟 取最大单位', () => {
    expect(formatCountdown('2026-09-30T12:00:00Z', now)).toBe('2d');
    expect(formatCountdown('2026-09-28T15:00:00Z', now)).toBe('3h');
    expect(formatCountdown('2026-09-28T12:30:00Z', now)).toBe('30m');
  });

  it('数字小于 365 天视为「距重置的相对毫秒」', () => {
    expect(formatCountdown(String(90 * 60 * 1000), now)).toBe('1h');
  });

  it('已过期或不可解析返回空串', () => {
    expect(formatCountdown('2026-09-28T11:00:00Z', now)).toBe('');
    expect(formatCountdown(null, now)).toBe('');
    expect(formatCountdown('not-a-date', now)).toBe('');
  });
});

describe('formatMoney', () => {
  it('按货币代码给符号，缺省两位小数', () => {
    expect(formatMoney('CNY', 12.4)).toBe('¥12.40');
    expect(formatMoney(null, 0)).toBe('¥0.00');
    expect(formatMoney('USD', 3.5)).toBe('$3.50');
  });
});

describe('errorLabel', () => {
  it('no_token 显示成「未配置」，其余原样', () => {
    expect(errorLabel('no_token')).toBe('未配置');
    expect(errorLabel('鉴权失败')).toBe('鉴权失败');
  });
});

describe('pickPrimary', () => {
  it('取已用 % 最大的窗口', () => {
    const primary = pickPrimary([
      { label: '5h', percent: 34, resetTime: null },
      { label: '周', percent: 62, resetTime: null },
    ]);
    expect(primary?.label).toBe('周');
  });

  it('空数组返回 null', () => {
    expect(pickPrimary([])).toBeNull();
  });
});

describe('formatHeader', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it('没有更新时间时显示拉取中', () => {
    expect(formatHeader(null, now)).toBe('用量  拉取中…');
  });

  it('按分钟/小时显示新鲜度', () => {
    expect(formatHeader(now - 30_000, now)).toBe('用量  刷新 刚刚');
    expect(formatHeader(now - 2 * 60_000, now)).toBe('用量  刷新 2m前');
    expect(formatHeader(now - 3 * 3_600_000, now)).toBe('用量  刷新 3h前');
  });
});

describe('formatProviderLines', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const base: ProviderState = {
    id: 'kimi',
    name: 'Kimi',
    windows: [],
    balance: null,
    error: null,
    lastUpdated: null,
  };

  it('Kimi 双窗口：标题行 + 每个周期一行，都带百分比与倒计时', () => {
    const state: ProviderState = {
      ...base,
      windows: [
        { label: '5h', percent: 18, resetTime: '2026-09-28T12:27:00Z' },
        { label: '周', percent: 31, resetTime: '2026-09-30T12:00:00Z' },
      ],
    };
    expect(formatProviderLines(state, THRESHOLDS, now)).toEqual([
      { text: 'Kimi', level: 'fresh' },
      { text: '  5h   18%  27m', level: 'fresh' },
      { text: '  周   31%  2d', level: 'fresh' },
    ]);
  });

  it('标题行按最紧（已用 % 最高）的窗口着色', () => {
    const state: ProviderState = {
      ...base,
      windows: [
        { label: '5h', percent: 18, resetTime: null },
        { label: '周', percent: 62, resetTime: null },
      ],
    };
    const lines = formatProviderLines(state, THRESHOLDS, now);
    expect(lines[0]).toEqual({ text: 'Kimi', level: 'warn' });
    expect(lines[1].level).toBe('fresh');
    expect(lines[2].level).toBe('warn');
  });

  it('三窗口（火山）会渲染成 4 行，标签对齐、百分比右对齐', () => {
    const state: ProviderState = {
      ...base,
      id: 'volcengine',
      name: '火山',
      windows: [
        { label: '5h', percent: 13, resetTime: null },
        { label: '周', percent: 4, resetTime: null },
        { label: '月', percent: 100, resetTime: null },
      ],
    };
    const lines = formatProviderLines(state, THRESHOLDS, now);
    expect(lines.map((l) => l.text)).toEqual(['火山', '  5h   13%', '  周    4%', '  月  100%']);
    expect(lines[3].level).toBe('danger');
  });

  it('没有重置时间时不输出倒计时', () => {
    const state: ProviderState = {
      ...base,
      windows: [{ label: '5h', percent: 18, resetTime: null }],
    };
    expect(formatProviderLines(state, THRESHOLDS, now)[1].text).toBe('  5h   18%');
  });

  it('余额型只有一行：名称 + 金额', () => {
    const state: ProviderState = {
      ...base,
      id: 'deepseek',
      name: 'DeepSeek',
      balance: { currency: 'CNY', total: 29.06 },
    };
    expect(formatProviderLines(state, THRESHOLDS, now)).toEqual([
      { text: 'DeepSeek  ¥29.06', level: 'fresh' },
    ]);
  });

  it('未配置是灰的，鉴权失败是红的', () => {
    expect(formatProviderLines({ ...base, id: 'mimo', name: 'MiMo', error: 'no_token' }, THRESHOLDS, now))
      .toEqual([{ text: 'MiMo  － 未配置', level: 'muted' }]);
    expect(
      formatProviderLines({ ...base, error: '鉴权失败' }, THRESHOLDS, now)[0].level,
    ).toBe('danger');
  });

  it('没有窗口也不是错误时显示占位短横', () => {
    expect(formatProviderLines(base, THRESHOLDS, now)).toEqual([{ text: 'Kimi  －', level: 'muted' }]);
  });
});
```

- [x] **Step 3: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/format.test.ts
```

Expected: FAIL —— 无法解析 `./format`。

- [x] **Step 4: 实现 `format.ts`**

```ts
import type { ProviderState, WindowView } from './types';

export type Level = 'fresh' | 'warn' | 'danger' | 'muted';

/** 小于 365 天的数字视为「距重置的相对毫秒」（沿用 useUsageState.ts:46 的启发式） */
const MAX_RELATIVE_MS = 365 * 24 * 60 * 60 * 1000;

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$' };

/** 终端显示宽度：CJK / 全角算 2 列 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += isWide(ch) ? 2 : 1;
  return width;
}

function isWide(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return '';
  if (displayWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const w = isWide(ch) ? 2 : 1;
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

export function padToWidth(text: string, width: number): string {
  const trimmed = truncateToWidth(text, width);
  const gap = width - displayWidth(trimmed);
  return gap > 0 ? trimmed + ' '.repeat(gap) : trimmed;
}

export function clamp(percent: number): number {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function formatPercent(percent: number): string {
  return `${Math.round(clamp(percent))}%`;
}

/** 阈值判定与 useUsageState.ts:134 一致：严格大于 */
export function levelFor(percent: number, thresholds: { warn: number; danger: number }): Level {
  const p = clamp(percent);
  if (p > thresholds.danger) return 'danger';
  if (p > thresholds.warn) return 'warn';
  return 'fresh';
}

function toEpochMs(resetTime: string | null, now: number): number | null {
  if (!resetTime) return null;
  const n = Number(resetTime);
  if (Number.isFinite(n) && n > 0) {
    return n < MAX_RELATIVE_MS ? now + n : n;
  }
  const parsed = Date.parse(resetTime);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 倒计时只保留最大单位（窄栏用）：'2d' / '3h' / '30m'，已过期返回空串 */
export function formatCountdown(resetTime: string | null, now: number): string {
  const target = toEpochMs(resetTime, now);
  if (target === null) return '';
  const ms = target - now;
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

export function formatMoney(currency: string | null, amount: number): string {
  const symbol = CURRENCY_SYMBOL[(currency ?? 'CNY').toUpperCase()] ?? '';
  const value = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${value.toFixed(2)}`;
}

export function errorLabel(error: string): string {
  return error === 'no_token' ? '未配置' : error;
}

/** 取已用 % 最大的窗口（并列时保留靠前的）。用于给「每家的标题行」着色 */
export function pickPrimary(windows: WindowView[]): WindowView | null {
  let best: WindowView | null = null;
  for (const w of windows) {
    if (!best || clamp(w.percent) > clamp(best.percent)) best = w;
  }
  return best;
}

export function formatHeader(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return '用量  拉取中…';
  const mins = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  const age = mins < 1 ? '刚刚' : mins < 60 ? `${mins}m前` : `${Math.floor(mins / 60)}h前`;
  return `用量  刷新 ${age}`;
}

/** 一行渲染结果：文本 + 该行的告警档位 */
export interface RenderedLine {
  text: string;
  level: Level;
}

/** 窗口标签固定 2 列显示宽度（5h / 周 / 月），百分比右对齐 4 列 */
const LABEL_WIDTH = 2;
const PERCENT_WIDTH = 4;

function formatWindowLine(window: WindowView, now: number): string {
  const parts = [
    `  ${padToWidth(window.label, LABEL_WIDTH)}`,
    formatPercent(window.percent).padStart(PERCENT_WIDTH),
  ];
  const reset = formatCountdown(window.resetTime, now);
  if (reset) parts.push(reset);
  return parts.join('  ');
}

/**
 * 把一个 provider 渲染成若干行（每家多行展开）：
 * - 出错：一行「名称  － 原因」
 * - 余额型：一行「名称  金额」（只有一项数据，不套标题行）
 * - 百分比型：标题行「名称」（按最紧的窗口着色）+ 每个窗口一行「  标签  百分比  倒计时」
 */
export function formatProviderLines(
  state: ProviderState,
  thresholds: { warn: number; danger: number },
  now: number,
): RenderedLine[] {
  if (state.error) {
    const label = errorLabel(state.error);
    return [{ text: `${state.name}  － ${label}`, level: state.error === 'no_token' ? 'muted' : 'danger' }];
  }

  if (state.balance) {
    return [
      {
        text: `${state.name}  ${formatMoney(state.balance.currency, state.balance.total)}`,
        level: 'fresh',
      },
    ];
  }

  if (state.windows.length === 0) {
    return [{ text: `${state.name}  －`, level: 'muted' }];
  }

  const tightest = pickPrimary(state.windows);
  const lines: RenderedLine[] = [
    { text: state.name, level: tightest ? levelFor(tightest.percent, thresholds) : 'muted' },
  ];
  for (const window of state.windows) {
    lines.push({ text: formatWindowLine(window, now), level: levelFor(window.percent, thresholds) });
  }
  return lines;
}
```

- [x] **Step 5: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/format.test.ts
```

Expected: 全绿。

- [x] **Step 6: 提交**

```powershell
git add opencode-plugin/src/types.ts opencode-plugin/src/format.ts opencode-plugin/src/format.test.ts
git commit -m "feat(opencode-plugin): 侧边栏纯格式化（宽度对齐/条形/倒计时/金额）"
```

---

## Task 4: `providers/http.ts` —— 请求封装与本地化错误

**Files:**
- Create: `opencode-plugin/src/providers/http.ts`
- Test: `opencode-plugin/src/providers/http.test.ts`

- [x] **Step 1: 写失败测试**

`opencode-plugin/src/providers/http.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseJsonObject, numberOr, httpRequest, UsageError } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseJsonObject', () => {
  it('解析对象', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('数组 / 标量 / 坏 JSON 一律回落到空对象', () => {
    expect(parseJsonObject('[1,2]')).toEqual({});
    expect(parseJsonObject('42')).toEqual({});
    expect(parseJsonObject('{ nope')).toEqual({});
    expect(parseJsonObject('')).toEqual({});
  });
});

describe('numberOr', () => {
  it('能转数字就用，否则回落', () => {
    expect(numberOr('12', 0)).toBe(12);
    expect(numberOr(undefined, 7)).toBe(7);
    expect(numberOr('abc', 7)).toBe(7);
  });
});

describe('httpRequest', () => {
  it('返回 status 与 body 文本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    const res = await httpRequest('https://example.com');
    expect(res.status).toBe(200);
    expect(res.text).toBe('{"ok":true}');
  });

  it('中继 fetch 抛错时转成「网络错误」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch'); }));
    await expect(httpRequest('https://example.com')).rejects.toThrow(UsageError);
    await expect(httpRequest('https://example.com')).rejects.toThrow('网络错误');
  });

  it('abort 时转成「超时」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }));
    await expect(httpRequest('https://example.com')).rejects.toThrow('超时');
  });
});
```

- [x] **Step 2: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/http.test.ts
```

Expected: FAIL —— 无法解析 `./http`。

- [x] **Step 3: 实现 `providers/http.ts`**

```ts
// 五家 provider 共用的请求封装。
// 对应主进程里的 axios 实例（src/main/usage-monitor.ts:53-58）：
// 统一浏览器 UA、8 秒超时、非 2xx 也把 body 读回来交给调用方判断。

export const REQUEST_TIMEOUT_MS = 8000;

/** 浏览器风格 UA，避免被部分 API 当作 node 客户端拒绝 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 已经本地化过的失败原因，message 可直接渲染 */
export class UsageError extends Error {}

export interface HttpResponse {
  status: number;
  text: string;
}

export async function httpRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') throw new UsageError('超时');
    throw new UsageError('网络错误');
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // 落到下面统一返回空对象
  }
  return {};
}

export function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
```

- [x] **Step 4: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/http.test.ts
```

Expected: 全绿。

- [x] **Step 5: 提交**

```powershell
git add opencode-plugin/src/providers/http.ts opencode-plugin/src/providers/http.test.ts
git commit -m "feat(opencode-plugin): provider 请求封装与本地化错误"
```

---

## Task 5: `providers/volcengine-sign.ts` —— V4 签名

从 `src/main/volcengine-sign.ts` **整体移植**，只改 `crypto` 的 import 形式。官方测试向量必须原样保留，它是两条实现不漂移的锚点。

**Files:**
- Create: `opencode-plugin/src/providers/volcengine-sign.ts`
- Test: `opencode-plugin/src/providers/volcengine-sign.test.ts`

- [x] **Step 1: 移植实现**

`opencode-plugin/src/providers/volcengine-sign.ts`：

```ts
// 火山引擎 OpenAPI V4 签名（纯函数，便于测试）。
// 规范见官方文档 https://www.volcengine.com/docs/6369/67269
//
// ⚠️ 本文件是 src/main/volcengine-sign.ts 的移植副本（主进程用 axios，插件只需签名本身）。
//    改动时必须同步两边，官方测试向量 src/main/volcengine-sign.test.ts 是防漂移锚点。

import { createHash, createHmac } from 'node:crypto';

export interface SignInput {
  method: 'GET' | 'POST';
  /** 服务地址，如 open.volcengineapi.com */
  host: string;
  region: string;
  /** 服务名，Ark 为 ark */
  service: string;
  action: string;
  version: string;
  /** 额外查询参数（Action / Version / Region 除外） */
  query?: Record<string, string>;
  body?: string;
  accessKey: string;
  secretKey: string;
  /** 请求时间，调用方传入以便测试 */
  date: Date;
}

export interface SignResult {
  headers: Record<string, string>;
  /** 参与签名的查询串，请求 URL 需与之完全一致 */
  canonicalQuery: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
}

const ALGORITHM = 'HMAC-SHA256';
/** 参与签名的请求头（官方 GET 示例的最小集） */
export const SIGNED_HEADERS = 'host;x-date';

/** 空 body 的 SHA256，用于 CanonicalRequest 末行 */
export const EMPTY_PAYLOAD_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hmacSha256(key: Buffer | string, content: string): Buffer {
  return createHmac('sha256', key).update(content, 'utf8').digest();
}

/** RFC3986 编码：encodeURIComponent 放行的 !'()* 需补转义，空格已是 %20 */
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/** 查询参数按 key 的 ASCII 升序排序后拼成 canonical 形式 */
export function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(params[k])}`)
    .join('&');
}

/** X-Date：UTC 的 YYYYMMDDTHHMMSSZ */
export function formatXDate(date: Date): string {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/g, '');
}

/** 由 secret 派生 kSigning：kDate → kRegion → kService → kSigning */
function deriveSigningKey(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(secretKey, date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'request');
}

export function signVolcengineRequest(input: SignInput): SignResult {
  const { method, host, region, service, accessKey, secretKey, date } = input;
  const xDate = formatXDate(date);
  const shortDate = xDate.slice(0, 8);
  const body = input.body ?? '';
  const payloadHash = body ? sha256Hex(body) : EMPTY_PAYLOAD_SHA256;

  const query = {
    Action: input.action,
    Version: input.version,
    ...(input.query || {}),
  };
  const canonicalQuery = buildCanonicalQuery(query);
  const canonicalHeaders = `host:${host}\nx-date:${xDate}\n`;

  const canonicalRequest = [
    method,
    '/',
    canonicalQuery,
    canonicalHeaders,
    SIGNED_HEADERS,
    payloadHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [ALGORITHM, xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kSigning = deriveSigningKey(secretKey, shortDate, region, service);
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    canonicalQuery,
    canonicalRequest,
    stringToSign,
    signature,
    headers: {
      Host: host,
      'X-Date': xDate,
      Authorization:
        `${ALGORITHM} Credential=${accessKey}/${credentialScope}, ` +
        `SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
    },
  };
}

/** 构造与签名一致的请求 URL（查询串复用 canonical 形式） */
export function buildVolcengineUrl(host: string, canonicalQuery: string): string {
  return `https://${host}/?${canonicalQuery}`;
}
```

- [x] **Step 2: 移植测试**

`opencode-plugin/src/providers/volcengine-sign.test.ts` —— 从 `src/main/volcengine-sign.test.ts` 原样复制，改两处：`import { describe, it, expect } from 'vitest';` 保留；`createHash` 改成 `from 'node:crypto'`；`from './volcengine-sign'` 改成 `'./volcengine-sign.js'`。

```ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  signVolcengineRequest,
  buildCanonicalQuery,
  formatXDate,
  EMPTY_PAYLOAD_SHA256,
  SIGNED_HEADERS,
} from './volcengine-sign';

// 官方文档 https://www.volcengine.com/docs/6369/67269 的 GET 示例测试向量
const AK = 'AKLTYWViMTVmZGYzM2E0NDI5Mzk2MDZjNjFmMjc2MjRjMzg';
const SK = 'WkRZeE1EQmxPVGhsWWpWak5HVmtNbUUxTXpZeU9UVXlOMlE1TmpZeVlqTQ==';
const DOC_DATE = new Date('2025-03-29T18:09:37Z');
const DOC_CANONICAL_HASH = '43171c1658c64b5db55c58d54988a4598d2d09a5613136beaa5eef40eae6e2c1';
const DOC_SIGNATURE = '1eda9e7e6b1728151a8e8791fdaf67cfbd28bd5c80d0fce2eb208746cf483105';

function docRequest() {
  return signVolcengineRequest({
    method: 'GET',
    host: 'billing.volcengineapi.com',
    region: 'cn-beijing',
    service: 'billing',
    action: 'QueryBalanceAcct',
    version: '2022-01-01',
    accessKey: AK,
    secretKey: SK,
    date: DOC_DATE,
  });
}

describe('formatXDate', () => {
  it('输出 UTC 的 YYYYMMDDTHHMMSSZ', () => {
    expect(formatXDate(DOC_DATE)).toBe('20250329T180937Z');
  });
});

describe('buildCanonicalQuery', () => {
  it('按 key 的 ASCII 升序排列', () => {
    expect(buildCanonicalQuery({ Version: 'v', Action: 'a', Region: 'cn-beijing' }))
      .toBe('Action=a&Region=cn-beijing&Version=v');
  });

  it('RFC3986 编码：空格转 %20，中文按 UTF-8 百分号编码', () => {
    expect(buildCanonicalQuery({ 'a b': 'x y' })).toBe('a%20b=x%20y');
    expect(buildCanonicalQuery({ '名': '值' })).toBe('%E5%90%8D=%E5%80%BC');
  });

  it('补转义 encodeURIComponent 放行的 !\'()*', () => {
    expect(buildCanonicalQuery({ "a!b'c(d)e*f": "g!h'i(j)k*l" }))
      .toBe("a%21b%27c%28d%29e%2Af=g%21h%27i%28j%29k%2Al");
  });

  it('连字符 / 下划线 / 点 / 波浪号保持原样（unreserved）', () => {
    expect(buildCanonicalQuery({ 'a-b_c.d~e': 'f-g_h.i~j' })).toBe('a-b_c.d~e=f-g_h.i~j');
  });
});

describe('signVolcengineRequest（官方文档测试向量）', () => {
  it('CanonicalRequest 与文档一致', () => {
    expect(docRequest().canonicalRequest).toBe(
      [
        'GET',
        '/',
        'Action=QueryBalanceAcct&Version=2022-01-01',
        'host:billing.volcengineapi.com',
        'x-date:20250329T180937Z',
        '',
        SIGNED_HEADERS,
        EMPTY_PAYLOAD_SHA256,
      ].join('\n')
    );
  });

  it('CanonicalRequest 的 SHA256 等于文档公布值', () => {
    const hash = createHash('sha256').update(docRequest().canonicalRequest, 'utf8').digest('hex');
    expect(hash).toBe(DOC_CANONICAL_HASH);
  });

  it('签名等于文档公布值', () => {
    expect(docRequest().signature).toBe(DOC_SIGNATURE);
  });

  it('StringToSign 为四行结构', () => {
    expect(docRequest().stringToSign).toBe(
      [
        'HMAC-SHA256',
        '20250329T180937Z',
        '20250329/cn-beijing/billing/request',
        DOC_CANONICAL_HASH,
      ].join('\n')
    );
  });

  it('Authorization 头格式与文档一致', () => {
    expect(docRequest().headers).toEqual({
      Host: 'billing.volcengineapi.com',
      'X-Date': '20250329T180937Z',
      Authorization:
        `HMAC-SHA256 Credential=${AK}/20250329/cn-beijing/billing/request, ` +
        `SignedHeaders=host;x-date, Signature=${DOC_SIGNATURE}`,
    });
  });

  it('时间不同则签名不同（签名确实绑定了 X-Date）', () => {
    const later = signVolcengineRequest({
      method: 'GET',
      host: 'billing.volcengineapi.com',
      region: 'cn-beijing',
      service: 'billing',
      action: 'QueryBalanceAcct',
      version: '2022-01-01',
      accessKey: AK,
      secretKey: SK,
      date: new Date('2025-03-29T18:09:38Z'),
    });
    expect(later.signature).not.toBe(DOC_SIGNATURE);
  });

  it('Coding Plan 额度查询：附加 Region 后仍能稳定签名', () => {
    const signed = signVolcengineRequest({
      method: 'GET',
      host: 'open.volcengineapi.com',
      region: 'cn-beijing',
      service: 'ark',
      action: 'GetCodingPlanUsage',
      version: '2024-01-01',
      query: { Region: 'cn-beijing' },
      accessKey: AK,
      secretKey: SK,
      date: DOC_DATE,
    });
    expect(signed.canonicalRequest.split('\n')[2]).toBe(
      'Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01'
    );
    expect(signed.headers.Authorization).toContain(
      'Credential=' + AK + '/20250329/cn-beijing/ark/request'
    );
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [x] **Step 3: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/volcengine-sign.test.ts
```

Expected: 全绿（签名与主进程共享同一批官方向量，能过就证明移植无偏差）。

- [x] **Step 4: 提交**

```powershell
git add opencode-plugin/src/providers/volcengine-sign.ts opencode-plugin/src/providers/volcengine-sign.test.ts
git commit -m "feat(opencode-plugin): 移植火山 V4 签名与官方测试向量"
```

---

## Task 6: 五家 provider 取数与映射

每家一个文件：纯映射函数 + `fetch<名字>`。映射函数的 fixture 全部取自 `src/main/usage-monitor.test.ts`。

**Files:**
- Create: `opencode-plugin/src/providers/kimi.ts` + `.test.ts`
- Create: `opencode-plugin/src/providers/minimax.ts` + `.test.ts`
- Create: `opencode-plugin/src/providers/deepseek.ts` + `.test.ts`
- Create: `opencode-plugin/src/providers/mimo.ts` + `.test.ts`
- Create: `opencode-plugin/src/providers/volcengine.ts` + `.test.ts`
- Create: `opencode-plugin/src/providers/index.ts`

### 6a Kimi

- [x] **Step 1: 写失败测试 `providers/kimi.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { calcPercent, mapKimiUsages } from './kimi';

describe('calcPercent', () => {
  it('按 used/limit 取整并夹到 0-100', () => {
    expect(calcPercent(1, 3)).toBe(33);
    expect(calcPercent(150, 100)).toBe(100);
    expect(calcPercent(-10, 100)).toBe(0);
    expect(calcPercent(100, 0)).toBe(0);
    expect(calcPercent('25', '100')).toBe(25);
  });
});

describe('mapKimiUsages', () => {
  it('解析 7 天窗口(usage)与 5 小时窗口(limits[0].detail)', () => {
    const json = {
      usage: { limit: '100', used: '31', remaining: '69', resetTime: '2026-08-28T13:24:22Z' },
      limits: [
        {
          window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
          detail: { limit: '100', used: '34', remaining: '66', resetTime: '2026-08-25T02:24:22Z' },
        },
      ],
    };
    expect(mapKimiUsages(json)).toEqual({
      weekly: { limit: 100, used: 31, remaining: 69, percent: 31, resetTime: '2026-08-28T13:24:22Z' },
      fiveHour: { limit: 100, used: 34, remaining: 66, percent: 34, resetTime: '2026-08-25T02:24:22Z' },
    });
  });

  it('缺字段时容错为 0', () => {
    const r = mapKimiUsages({});
    expect(r.weekly.percent).toBe(0);
    expect(r.fiveHour.resetTime).toBeNull();
    expect(r.fiveHour.limit).toBe(0);
  });
});
```

- [x] **Step 2: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/kimi.test.ts
```

Expected: FAIL。

- [x] **Step 3: 实现 `providers/kimi.ts`**

```ts
// Kimi 用量：GET https://api.kimi.com/coding/v1/usages（Bearer sk-kimi-…）
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapKimiUsages / fetchKimi。

import type { RawAppConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const KIMI_API = 'https://api.kimi.com/coding/v1/usages';

export interface UsageMetric {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  resetTime: string | null;
}

export function calcPercent(used: number | string, limit: number | string): number {
  const u = Number(used) || 0;
  const l = Number(limit) || 0;
  if (l <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((u / l) * 100)));
}

// 新接口只给 7 天周期（usage）与 5 小时窗口（limits[0].detail）两档；
// totalQuota 恒为空对象，不渲染。
export function mapKimiUsages(json: Record<string, unknown>): { fiveHour: UsageMetric; weekly: UsageMetric } {
  const toMetric = (o: Record<string, unknown> | null | undefined): UsageMetric => {
    const limit = Number(o?.limit) || 0;
    const used = Number(o?.used) || 0;
    return {
      limit,
      used,
      remaining: Number(o?.remaining) || 0,
      percent: calcPercent(used, limit),
      resetTime: o?.resetTime ? String(o.resetTime) : null,
    };
  };
  const usage = (json.usage as Record<string, unknown>) || {};
  const limits = (json.limits as unknown[]) || [];
  const detail =
    ((limits[0] as Record<string, unknown> | undefined)?.detail as Record<string, unknown>) || undefined;
  return { fiveHour: toMetric(detail), weekly: toMetric(usage) };
}

export async function fetchKimi(raw: RawAppConfig): Promise<WindowView[]> {
  const token = (raw.kimi?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(KIMI_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const mapped = mapKimiUsages(parseJsonObject(res.text));
  return [
    { label: '5h', percent: mapped.fiveHour.percent, resetTime: mapped.fiveHour.resetTime },
    { label: '周', percent: mapped.weekly.percent, resetTime: mapped.weekly.resetTime },
  ];
}
```

- [x] **Step 4: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/kimi.test.ts
```

Expected: 全绿。

### 6b MiniMax

- [x] **Step 5: 写失败测试 `providers/minimax.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mapMiniMax } from './minimax';

const json = {
  base_resp: { status_code: 0, status_msg: 'success' },
  model_remains: [
    { model_name: 'other', current_interval_remaining_percent: 90 },
    {
      model_name: 'general',
      current_interval_remaining_percent: 52,
      current_weekly_remaining_percent: 38,
      remains_time: 7200000,
      weekly_remains_time: 259200000,
    },
  ],
};

describe('mapMiniMax', () => {
  it('只取 general 档，并把「剩余 %」翻成「已用 %」', () => {
    expect(mapMiniMax(json)).toEqual({
      fiveHour: { label: '5h', percent: 48, resetTime: '7200000' },
      weekly: { label: '周', percent: 62, resetTime: '259200000' },
    });
  });

  it('status_code 非 0 时抛错', () => {
    expect(() => mapMiniMax({ base_resp: { status_code: 1001, status_msg: 'boom' } })).toThrow('boom');
  });

  it('找不到 general 档时抛错', () => {
    expect(() => mapMiniMax({ base_resp: { status_code: 0 }, model_remains: [] })).toThrow('general');
  });

  it('缺字段容错为 100% 已用（即剩余 0）', () => {
    const r = mapMiniMax({ base_resp: { status_code: 0 }, model_remains: [{ model_name: 'general' }] });
    expect(r.fiveHour.percent).toBe(100);
    expect(r.fiveHour.resetTime).toBeNull();
  });
});
```

- [x] **Step 6: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/minimax.test.ts
```

Expected: FAIL。

- [x] **Step 7: 实现 `providers/minimax.ts`**

```ts
// MiniMax 用量：GET https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains
// ⚠️ 服务端给的是「剩余 %」，展示用的「已用 %」= 100 - remaining。
// 映射逻辑移植自 src/main/usage-monitor.ts 的 fetchMiniMax，语义对齐
// src/renderer/src/composables/useUsageState.ts:206。

import type { RawAppConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const MINIMAX_API = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';

function usedPercent(remaining: unknown): number {
  const p = 100 - (Number(remaining) || 0);
  return Math.max(0, Math.min(100, p));
}

export function mapMiniMax(json: Record<string, unknown>): { fiveHour: WindowView; weekly: WindowView } {
  const baseResp = json.base_resp as Record<string, unknown> | undefined;
  if (baseResp?.status_code !== 0) {
    throw new UsageError((baseResp?.status_msg as string) || 'API 错误');
  }

  const remains = (json.model_remains as Array<Record<string, unknown>>) || [];
  const general = remains.find((m) => m?.model_name === 'general');
  if (!general) throw new UsageError('响应缺少 general 档');

  return {
    fiveHour: {
      label: '5h',
      percent: usedPercent(general.current_interval_remaining_percent),
      resetTime: general.remains_time ? String(general.remains_time) : null,
    },
    weekly: {
      label: '周',
      percent: usedPercent(general.current_weekly_remaining_percent),
      resetTime: general.weekly_remains_time ? String(general.weekly_remains_time) : null,
    },
  };
}

export async function fetchMiniMax(raw: RawAppConfig): Promise<WindowView[]> {
  const token = (raw.minimax?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(MINIMAX_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const mapped = mapMiniMax(parseJsonObject(res.text));
  return [mapped.fiveHour, mapped.weekly];
}
```

- [x] **Step 8: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/minimax.test.ts
```

Expected: 全绿。

### 6c DeepSeek

- [x] **Step 9: 写失败测试 `providers/deepseek.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mapDeepseekBalance } from './deepseek';

describe('mapDeepseekBalance', () => {
  it('取 balance_infos[0] 并解析数字', () => {
    const json = {
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '5.00', topped_up_balance: '7.34' }],
    };
    expect(mapDeepseekBalance(json)).toEqual({ currency: 'CNY', total: 12.34 });
  });

  it('balance_infos 为空抛错', () => {
    expect(() => mapDeepseekBalance({ is_available: false, balance_infos: [] })).toThrow();
  });
});
```

- [x] **Step 10: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/deepseek.test.ts
```

Expected: FAIL。

- [x] **Step 11: 实现 `providers/deepseek.ts`**

```ts
// DeepSeek 余额：GET https://api.deepseek.com/user/balance（Bearer sk-…）
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapDeepseekBalance。

import type { RawAppConfig } from '../config';
import type { BalanceView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';

export function mapDeepseekBalance(json: Record<string, unknown>): BalanceView {
  const infos = (json.balance_infos as unknown[]) || [];
  const first = infos[0] as Record<string, unknown> | undefined;
  if (!first) throw new UsageError('响应缺少余额字段');
  return {
    currency: first.currency ? String(first.currency) : null,
    total: parseFloat(String(first.total_balance)) || 0,
  };
}

export async function fetchDeepseek(raw: RawAppConfig): Promise<BalanceView> {
  const token = (raw.deepseek?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(DEEPSEEK_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  return mapDeepseekBalance(parseJsonObject(res.text));
}
```

- [x] **Step 12: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/deepseek.test.ts
```

Expected: 全绿。

### 6d MiMo

- [x] **Step 13: 写失败测试 `providers/mimo.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mapMimoBalance } from './mimo';

describe('mapMimoBalance', () => {
  it('解析 data 信封内的总额/赠送/付费', () => {
    const json = {
      code: 0,
      data: { currency: 'CNY', totalBalance: '21.66', grantedBalance: '1.66', paidBalance: '20.00' },
    };
    expect(mapMimoBalance(json)).toEqual({ currency: 'CNY', total: 21.66 });
  });

  it('兼容 snake_case 字段名与嵌套 balance 对象', () => {
    const r = mapMimoBalance({ data: { balance: { total_balance: '30.5', granted_balance: '0.5' } } });
    expect(r.total).toBe(30.5);
    expect(r.currency).toBe('CNY');
  });

  it('balance 为嵌套对象且字段是短名时也能取到总额', () => {
    expect(mapMimoBalance({ balance: { total: 12.34, paid: 12.34, granted: 0 } }).total).toBe(12.34);
  });

  it('带 scale 倍率字段时换算金额单位', () => {
    expect(mapMimoBalance({ data: { scale: 100, totalBalance: 2166 } }).total).toBe(21.66);
  });

  it('只有总额为 0 时仍能解析出 0', () => {
    expect(mapMimoBalance({ data: { totalBalance: 0 } }).total).toBe(0);
  });

  it('找不到任何余额字段时抛错', () => {
    expect(() => mapMimoBalance({ data: { foo: 1 } })).toThrow('余额');
  });
});
```

- [x] **Step 14: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/mimo.test.ts
```

Expected: FAIL。

- [x] **Step 15: 实现 `providers/mimo.ts`**

```ts
// MiMo 余额：GET https://platform.xiaomimimo.com/api/v1/balance
// 鉴权走控制台会话 Cookie（api-platform_serviceToken / userId 等），调模型的 sk- key 查不到余额。
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapMimoBalance —— 小米未公开响应结构，
// 故做两层容错：剥 data/result 信封 + 字段名「去下划线忽略大小写」匹配。

import type { RawAppConfig } from '../config';
import type { BalanceView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const MIMO_BALANCE_API = 'https://platform.xiaomimimo.com/api/v1/balance';

const MIMO_TOTAL_KEYS = [
  'totalBalance', 'balance', 'total', 'availableBalance',
  'usableBalance', 'remainBalance', 'remainingBalance', 'amount',
];
const MIMO_CURRENCY_KEYS = ['currency', 'currencyCode', 'curr'];
const MIMO_SCALE_KEYS = ['scale', 'unit', 'amountScale', 'precision'];

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 键名归一化：去掉 _ - 空白并转小写，让候选名能匹配多种命名风格 */
function normalizeKey(k: string): string {
  return k.replace(/[_\-\s]/g, '').toLowerCase();
}

function pickNumber(src: Record<string, unknown>, keys: string[]): number | null {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [k, v] of Object.entries(src)) {
    if (!wanted.has(normalizeKey(k))) continue;
    const n = toFiniteNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function pickString(src: Record<string, unknown>, keys: string[]): string | null {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [k, v] of Object.entries(src)) {
    if (wanted.has(normalizeKey(k)) && typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

export function mapMimoBalance(json: Record<string, unknown>): BalanceView {
  // 剥信封：最多向下剥 3 层 data / result
  let payload: Record<string, unknown> = json;
  for (let i = 0; i < 3; i++) {
    const next = (payload.data ?? payload.result) as unknown;
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      payload = next as Record<string, unknown>;
    } else {
      break;
    }
  }
  // balance 可能是嵌套对象 { balance: { total, paid, granted } }，摊平后一起匹配
  const nested = payload.balance;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    payload = { ...payload, ...(nested as Record<string, unknown>) };
  }

  const rawTotal = pickNumber(payload, MIMO_TOTAL_KEYS);
  if (rawTotal === null) throw new UsageError('响应缺少余额字段');

  const scale = pickNumber(payload, MIMO_SCALE_KEYS);
  const div = scale !== null && scale > 1 ? scale : 1;

  return {
    currency: pickString(payload, MIMO_CURRENCY_KEYS) ?? 'CNY',
    total: Math.round((rawTotal / div) * 100) / 100,
  };
}

export async function fetchMimo(raw: RawAppConfig): Promise<BalanceView> {
  const cookie = (raw.mimo?.token ?? '').trim();
  if (!cookie) throw new UsageError('no_token');

  const res = await httpRequest(MIMO_BALANCE_API, {
    headers: {
      ...BROWSER_HEADERS,
      Cookie: cookie,
      Origin: 'https://platform.xiaomimimo.com',
      Referer: 'https://platform.xiaomimimo.com/#/console/balance',
    },
  });

  if (res.status === 401 || res.status === 403) throw new UsageError('登录态已过期');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const json = parseJsonObject(res.text);
  try {
    return mapMimoBalance(json);
  } catch (error) {
    // 控制台也可能用 HTTP 200 + code/message 表达失败
    const message = typeof json.message === 'string' ? json.message
      : typeof json.msg === 'string' ? json.msg : '';
    if (json.loginUrl || /login|auth|token|unauthor|expire|session|未登录|登录/i.test(message)) {
      throw new UsageError('登录态已过期');
    }
    throw error;
  }
}
```

- [x] **Step 16: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/mimo.test.ts
```

Expected: 全绿。

### 6e 火山

- [x] **Step 17: 写失败测试 `providers/volcengine.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mapVolcengineUsage, parseCookieJar } from './volcengine';

describe('mapVolcengineUsage', () => {
  it('解析三档定额，Percent 就是「已用 %」', () => {
    const real = {
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 6.0932815, ResetTimestamp: 1787639742, Cap: 100 },
          { Level: 'weekly', Percent: 0.8124375333333332, ResetTimestamp: 1788105600, Cap: 100 },
          { Level: 'monthly', Percent: 0.4062187666666666, ResetTimestamp: 1790351999, Cap: 100 },
        ],
      },
    };
    const windows = mapVolcengineUsage(real);
    expect(windows.map((w) => w.label)).toEqual(['5h', '周', '月']);
    expect(windows.map((w) => w.percent)).toEqual([6, 1, 0]);
    expect(windows[0].resetTime).toBe(new Date(1787639742 * 1000).toISOString());
  });

  it('兼容 AK/SK 通道的 ResetTime 字段名', () => {
    const windows = mapVolcengineUsage({
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 12.5, Cap: 100, ResetTime: 1787639742 },
          { Level: 'weekly', Percent: 30, Cap: 100, ResetTime: 1788105600 },
          { Level: 'monthly', Percent: 45, Cap: 100, ResetTime: 1790351999 },
        ],
      },
    });
    expect(windows.map((w) => w.percent)).toEqual([13, 30, 45]);
    expect(windows[1].resetTime).toBe(new Date(1788105600 * 1000).toISOString());
  });

  it('缺少 QuotaUsage 时容错为 0 且无重置时间', () => {
    const windows = mapVolcengineUsage({});
    expect(windows.map((w) => w.percent)).toEqual([0, 0, 0]);
    expect(windows[2].resetTime).toBeNull();
  });
});

describe('parseCookieJar', () => {
  it('解析 "a=1; b=2"', () => {
    expect(parseCookieJar('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('值里含等号时只按首个等号切分', () => {
    expect(parseCookieJar('token=ab=cd==')).toEqual({ token: 'ab=cd==' });
  });

  it('容忍空片段与多余空格', () => {
    expect(parseCookieJar('  a=1 ;; ; b = 2 ;flag; c=')).toEqual({ a: '1', b: '2', c: '' });
  });
});
```

- [x] **Step 18: 跑测试确认失败**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/volcengine.test.ts
```

Expected: FAIL。

- [x] **Step 19: 实现 `providers/volcengine.ts`**

```ts
// 火山 Ark Coding Plan 额度。
// 鉴权优先级与主进程一致（src/main/usage-monitor.ts:398-501）：
//   AK/SK（官方 OpenAPI，长期有效）→ Cookie（控制台会话，约一周失效）。
// ⚠️ 与主进程的唯一差别：插件只读，不把服务端下发的 Set-Cookie 合并回 config.json
//    （避免与桌面应用互相覆盖），cookie 过期时直接显示「登录态已过期」。

import type { RawAppConfig, RawVolcengineConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';
import { buildVolcengineUrl, signVolcengineRequest } from './volcengine-sign';

const VOLCENGINE_API =
  'https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage';
const VOLCENGINE_OPEN_HOST = 'open.volcengineapi.com';
const VOLCENGINE_OPEN_REGION = 'cn-beijing';
const VOLCENGINE_OPEN_SERVICE = 'ark';

const LEVELS = [
  { level: 'session', label: '5h' as const },
  { level: 'weekly', label: '周' as const },
  { level: 'monthly', label: '月' as const },
];

/** "a=1; b=2" → { a: '1', b: '2' }，容忍空格与空片段 */
export function parseCookieJar(cookie: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of (cookie || '').split(';')) {
    const kv = part.trim();
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return jar;
}

// QuotaUsage 每档只给 Percent(已用%) 与 Cap(上限) 与重置时间；
// 重置字段在两条通道上分别叫 ResetTimestamp / ResetTime，这里兼容两种。
export function mapVolcengineUsage(json: Record<string, unknown>): WindowView[] {
  const quota = ((json.Result as Record<string, unknown> | undefined)?.QuotaUsage as unknown[]) || [];
  return LEVELS.map(({ level, label }) => {
    const item = (quota as Array<Record<string, unknown>>).find((q) => q?.Level === level);
    const percent = Number(item?.Percent);
    const resetSec = Number(item?.ResetTimestamp ?? item?.ResetTime);
    return {
      label,
      percent: Math.max(0, Math.min(100, Math.round(percent || 0))),
      resetTime:
        Number.isFinite(resetSec) && resetSec > 0
          ? new Date(resetSec * 1000).toISOString()
          : null,
    };
  });
}

function apiErrorCode(json: Record<string, unknown>): string | null {
  const metadata = json.ResponseMetadata as Record<string, unknown> | undefined;
  const error = metadata?.Error as Record<string, unknown> | undefined;
  return error?.Code ? String(error.Code) : null;
}

/** AK/SK 通道：官方 OpenAPI + V4 签名。返回缺档时抛错，交由调用方回退 Cookie */
async function fetchByAksk(cfg: RawVolcengineConfig): Promise<WindowView[]> {
  const signed = signVolcengineRequest({
    method: 'GET',
    host: VOLCENGINE_OPEN_HOST,
    region: VOLCENGINE_OPEN_REGION,
    service: VOLCENGINE_OPEN_SERVICE,
    action: 'GetCodingPlanUsage',
    version: '2024-01-01',
    query: { Region: VOLCENGINE_OPEN_REGION },
    accessKey: (cfg.accessKey ?? '').trim(),
    secretKey: (cfg.secretKey ?? '').trim(),
    date: new Date(),
  });

  const res = await httpRequest(buildVolcengineUrl(VOLCENGINE_OPEN_HOST, signed.canonicalQuery), {
    headers: signed.headers,
  });
  const json = parseJsonObject(res.text);

  const errCode = apiErrorCode(json);
  if (errCode) throw new UsageError(`AK/SK 调用失败: ${errCode}`);
  if (res.status >= 400) throw new UsageError(`AK/SK 调用失败: HTTP ${res.status}`);

  const present = new Set(
    (((json.Result as Record<string, unknown> | undefined)?.QuotaUsage as Array<Record<string, unknown>>) || [])
      .map((q) => String(q?.Level)),
  );
  const missing = LEVELS.filter(({ level }) => !present.has(level));
  if (missing.length > 0) {
    // AK/SK 通道的档位可能少于控制台 Cookie 通道，此时回退而不是展示 0
    throw new UsageError(`AK/SK 响应缺少 ${missing.map((m) => m.level).join('/')} 档`);
  }
  return mapVolcengineUsage(json);
}

/** Cookie 通道：控制台内部网关，依赖登录态 */
async function fetchByCookie(cfg: RawVolcengineConfig): Promise<WindowView[]> {
  const res = await httpRequest(VOLCENGINE_API, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      Cookie: (cfg.cookie ?? '').trim(),
      'x-csrf-token': (cfg.csrfToken ?? '').trim(),
      'Content-Type': 'application/json',
      Origin: 'https://console.volcengine.com',
      Referer: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
    },
  });
  const json = parseJsonObject(res.text);

  // 火山鉴权失败时返回 HTTP 200 + ResponseMetadata.Error（InvalidCSRFToken 等），
  // 因此不能只按 status 判断。
  const errCode = apiErrorCode(json);
  if (errCode) {
    if (/csrf|token/i.test(errCode)) throw new UsageError('x-csrf-token 已过期');
    if (/login|signature|access.?key|credential|auth|session/i.test(errCode)) throw new UsageError('登录态已过期');
    throw new UsageError(`API 错误: ${errCode}`);
  }
  if (res.status === 401 || res.status === 403) throw new UsageError('登录态已过期');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const quota = (json.Result as { QuotaUsage?: unknown } | undefined)?.QuotaUsage;
  if (!quota) throw new UsageError('响应缺少 QuotaUsage');
  return mapVolcengineUsage(json);
}

export async function fetchVolcengine(raw: RawAppConfig): Promise<WindowView[]> {
  const cfg = raw.volcengine;
  if (!cfg) throw new UsageError('no_token');

  const hasAksk = Boolean((cfg.accessKey ?? '').trim() && (cfg.secretKey ?? '').trim());
  if (hasAksk) {
    try {
      return await fetchByAksk(cfg);
    } catch {
      // AK/SK 不可用时回退 Cookie 通道
    }
  }

  if (!(cfg.cookie ?? '').trim() || !(cfg.csrfToken ?? '').trim()) throw new UsageError('no_token');
  return fetchByCookie(cfg);
}
```

- [x] **Step 20: 跑测试确认通过**

```powershell
Set-Location opencode-plugin; npx vitest run src/providers/volcengine.test.ts
```

Expected: 全绿。

### 6f 注册表

- [x] **Step 21: 创建 `providers/index.ts`**

```ts
import type { RawAppConfig } from '../config';
import type { ProviderId, ProviderResult } from '../types';
import { fetchKimi } from './kimi';
import { fetchMiniMax } from './minimax';
import { fetchVolcengine } from './volcengine';
import { fetchDeepseek } from './deepseek';
import { fetchMimo } from './mimo';

export interface ProviderDefinition {
  id: ProviderId;
  /** 侧边栏显示名，同时也是 config.json 里的字段名 */
  name: string;
  fetch(raw: RawAppConfig): Promise<ProviderResult>;
}

/** 百分比型：把窗口数组包成 ProviderResult */
async function quotaFetch(windows: Promise<ProviderResult['windows']>): Promise<ProviderResult> {
  return { windows: await windows, balance: null };
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'kimi',
    name: 'Kimi',
    fetch: (raw) => quotaFetch(fetchKimi(raw)),
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    fetch: (raw) => quotaFetch(fetchMiniMax(raw)),
  },
  {
    id: 'volcengine',
    name: '火山',
    fetch: (raw) => quotaFetch(fetchVolcengine(raw)),
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    fetch: async (raw) => ({ windows: [], balance: await fetchDeepseek(raw) }),
  },
  {
    id: 'mimo',
    name: 'MiMo',
    fetch: async (raw) => ({ windows: [], balance: await fetchMimo(raw) }),
  },
];

/**
 * 只保留 config.json 里显式 `enabled === true` 的 provider。
 * 注意：`enabled` 但 `token` 为空的那家**仍会返回**，由渲染层画成灰色「未配置」——
 * 规格要求不静默隐藏「已启用但没填凭据」的行。
 */
export function enabledProviders(raw: RawAppConfig): ProviderDefinition[] {
  return PROVIDERS.filter((p) => raw[p.id]?.enabled === true);
}
```

- [x] **Step 22: 跑全部测试 + 类型检查**

```powershell
Set-Location opencode-plugin; npm test; npm run typecheck
```

Expected: 全绿；typecheck 无错误。

- [x] **Step 23: 提交**

```powershell
git add opencode-plugin/src/providers
git commit -m "feat(opencode-plugin): 五家 provider 取数与响应映射"
```

---

## Task 7: `tui.tsx` —— 轮询、缓存、渲染、手动刷新

**Files:**
- Modify: `opencode-plugin/src/tui.tsx`（整体替换 Task 1 的占位实现）

- [x] **Step 1: 整体替换 `opencode-plugin/src/tui.tsx`**

```tsx
import { Plugin } from '@opencode/plugin/tui';
import { For, createSignal } from 'solid-js';
import { loadConfig, DEFAULT_THRESHOLDS } from './config';
import type { RawAppConfig, Thresholds } from './config';
import { formatHeader, formatProviderLines } from './format';
import type { Level } from './format';
import { enabledProviders } from './providers/index';
import type { ProviderDefinition } from './providers/index';
import type { ProviderId, ProviderResult, ProviderState } from './types';

const PLUGIN_ID = 'ai-signal-light.usage';
/** 与 config.json 的 intervalMinutes 解耦：侧边栏要更新鲜，但也不能打爆配额接口 */
const REFRESH_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
/** 重绘「刷新 Xm前」的节拍 */
const TICK_MS = 30 * 1000;
const COMMAND_ID = 'usage.refresh';

interface Snapshot {
  updatedAt: number | null;
  configError: string | null;
  thresholds: Thresholds;
  providers: ProviderState[];
}

const EMPTY_STATE = (definition: ProviderDefinition): ProviderState => ({
  id: definition.id,
  name: definition.name,
  windows: [],
  balance: null,
  error: null,
  lastUpdated: null,
});

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    const [snapshot, updateSnapshot] = context.storage.store<Snapshot>('snapshot', {
      initial: {
        updatedAt: null,
        configError: null,
        thresholds: { ...DEFAULT_THRESHOLDS },
        // 首屏还不知道哪些 provider 被启用，先空着；第一轮刷新后填充
        providers: [],
      },
    });

    // 让「刷新 Xm前」自己走字
    const [now, setNow] = createSignal(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);

    /** 最近一次写入的结果，用于在退避期间保留上一轮的值 */
    let latest: ProviderState[] = [];
    const failures = new Map<ProviderId, number>();
    const backoffUntil = new Map<ProviderId, number>();
    let inFlight: Promise<void> | null = null;

    async function fetchOne(definition: ProviderDefinition, config: RawAppConfig): Promise<ProviderState> {
      try {
        const result: ProviderResult = await definition.fetch(config);
        failures.delete(definition.id);
        backoffUntil.delete(definition.id);
        return {
          id: definition.id,
          name: definition.name,
          windows: result.windows,
          balance: result.balance,
          error: null,
          lastUpdated: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '拉取失败';
        const count = (failures.get(definition.id) ?? 0) + 1;
        failures.set(definition.id, count);
        backoffUntil.set(
          definition.id,
          Date.now() + Math.min(MAX_BACKOFF_MS, REFRESH_MS * 2 ** count),
        );
        return {
          id: definition.id,
          name: definition.name,
          windows: [],
          balance: null,
          error: message,
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    /** 单飞：轮询、首次加载、手动刷新共享同一个 in-flight promise */
    function refreshAll(manual = false): Promise<void> {
      if (inFlight) return inFlight;
      const run = async (): Promise<void> => {
        const { config, thresholds, error } = loadConfig();
        const startedAt = Date.now();
        const active = enabledProviders(config);
        const due = active.filter((p) => manual || startedAt >= (backoffUntil.get(p.id) ?? 0));

        const settled = await Promise.all(due.map((p) => fetchOne(p, config)));
        const byId = new Map<ProviderId, ProviderState>(settled.map((s) => [s.id, s]));
        // 按注册表顺序输出本轮启用的 provider；退避中没参与本轮的直接沿用上一轮的值
        latest = active.map((p) => byId.get(p.id) ?? latest.find((s) => s.id === p.id) ?? EMPTY_STATE(p));

        await updateSnapshot((draft) => {
          draft.updatedAt = Date.now();
          draft.configError = error;
          draft.thresholds = thresholds;
          draft.providers = latest;
        });
      };

      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }

    const colorFor = (level: Level) => {
      if (level === 'danger') return context.theme.text.feedback.error.base;
      if (level === 'warn') return context.theme.text.feedback.warning.base;
      if (level === 'muted') return context.theme.text.muted;
      return context.theme.text.feedback.success.base;
    };

    const unclaim = context.ui.slot({
      append: 'sidebar.content',
      render: () => (
        <box flexDirection="column">
          <text fg={context.theme.text.base}>{formatHeader(snapshot.updatedAt, now())}</text>
          {snapshot.configError ? (
            <text fg={context.theme.text.feedback.error.base}>{snapshot.configError}</text>
          ) : null}
          <For each={snapshot.providers}>
            {(state) => (
              <For each={formatProviderLines(state, snapshot.thresholds, now())}>
                {(line) => <text fg={colorFor(line.level)}>{line.text}</text>}
              </For>
            )}
          </For>
        </box>
      ),
    });

    const unclaimCommands = context.ui.slot({
      append: 'app',
      render: () => {
        // keymap.layer 必须由「组件」调用（setup 里调用会报 Keymap.Provider is missing）——
        // app 插槽常驻挂载，适合放命令注册。
        context.keymap.layer(() => ({
          mode: 'global',
          commands: [
            {
              id: COMMAND_ID,
              title: '刷新供应商用量',
              description: '立即重新拉取 Kimi / MiniMax / 火山 / DeepSeek / MiMo 用量',
              group: '用量',
              bind: 'ctrl+alt+u',
              palette: true,
              slash: { name: 'usage' },
              run: async () => {
                await refreshAll(true);
                const failed = latest.filter((s) => s.error).length;
                context.ui.toast.show({
                  message: `已刷新 ${latest.length} 家${failed > 0 ? `（${failed} 家失败）` : ''}`,
                  variant: failed > 0 ? 'warning' : 'success',
                  duration: 3000,
                });
              },
            },
          ],
          bindings: [COMMAND_ID],
        }));
        return null;
      },
    });

    void refreshAll();
    const timer = setInterval(() => void refreshAll(), REFRESH_MS);

    return () => {
      clearInterval(timer);
      clearInterval(ticker);
      unclaim();
      unclaimCommands();
    };
  },
});
```

- [x] **Step 2: 类型检查**

```powershell
Set-Location opencode-plugin; npm run typecheck
```

Expected: 无错误。

常见失败与修法：

- 报 `Property 'providers' does not exist on type 'Store<Snapshot>'` → 检查 `Snapshot` 是否在 `storage.store<Snapshot>` 里显式传了泛型。
- 报 JSX 元素类型不认识的 `box` / `text` → `tsconfig.json` 的 `jsxImportSource` 必须是 `@opentui/solid`，且 `@opentui/solid` 已安装。
- 报 `fetch` 不存在 → `@types/node` 未装或 `types` 没包含 `node`。

**已经踩过的两个坑（本仓库实测，代码块里已是修好的版本，别再改回去）：**

- `TS2305: Module '"@opencode/plugin/tui"' has no exported member 'Context'` + `TS6133: 'Context' is declared but its value is never read`
  → 就是事实表里警告的那条：`Context` 不是顶层导出。**照计划代码块删掉那行 `import type { Context } from '@opencode/plugin/tui';`，不要写它**，
  `setup(context)` 靠 `Plugin.define` 的上下文推断拿类型。
- `TS7006: Parameter 'message' implicitly has an 'any' type`（出现在 `<Show when={snapshot.configError}>{(message) => …}</Show>`）
  → 不要用 `Show`，直接用三元表达式渲染（计划代码块里已经这么写了）：
  `{snapshot.configError ? <text fg={…}>{snapshot.configError}</text> : null}`，同时把 `Show` 从 `solid-js` 的 import 里去掉
  （`noUnusedLocals` 会因为没用到而报错）。

**运行时的坑（类型检查发现不了，E2E 才暴露）：**

- `plugin operation failed … stage=setup … error="Keymap.Provider is missing"`
  → `context.keymap.layer()` **必须由组件调用**，放在 `setup()` 里会抛这个错；而且 `setup` 一旦抛异常，
    它之前注册的 `sidebar.content` 插槽也会一起失效，表现为**侧边栏整块空白**。
  → 修法（计划代码块里已是修好的版本）：把命令注册挪进一个 `append: 'app'` 的插槽 render 里
    （`app` 插槽常驻挂载），并把返回的注销函数加进 `setup` 的 cleanup。
  → 这个错误只在 `~/.local/share/opencode/log/opencode.log` 里，且**不带 `error` 关键字之外的其他提示**，
    排查时直接 `Select-String "operation failed|ai-signal-light"` 最快。

- [x] **Step 3: 跑全部单测**

```powershell
Set-Location opencode-plugin; npm test
```

Expected: 前面所有测试仍全绿。

- [ ] **Step 4: 端到端验证**

```powershell
opencode
```

逐项确认：

1. 侧边栏出现 1 行表头（`用量  刷新 …`）+ 五家的多行展开（配额型每家 1 行标题 + 每周期 1 行；余额型 1 行）。
2. 用正式版 config 的当前状态对照预期：五家都应有真实数据 ——
   - `Kimi` / `MiniMax` / `火山` 每家一个标题行 + 每周期一行（百分比 + 倒计时），颜色按各窗口自己的阈值（<50 绿）。
   - `DeepSeek` / `MiMo` 单行「名称  金额」。
3. 输入 `/usage` 回车 → toast 报 `已刷新 5 家（N 家失败）`。
4. 按 `Ctrl+Alt+U` → 同样触发（若无反应，说明该键位不合法，把 `bind` 改成 `false` 并在 README 记下「快捷键需自行在 cli.json 绑定」）。
5. 退出并重开 `opencode` → 首屏立刻显示上一轮缓存（表头时间不是「拉取中…」），随后自动刷新。
6. 把 config.json 里 `mimo` 临时改成 `enabled: false`，`/usage` 刷新后该行应**消失**；改回 `true` 再刷新后回来。

**实际验证记录（2026-09-28）：**

| 项 | 结果 |
|---|---|
| 1、2 渲染 | ✅ 用户目视确认，五家真实数据（Kimi 5h/周、MiniMax 5h/周、火山 5h/周/月、DeepSeek ¥29.06、MiMo ¥33.06） |
| 3 `/usage` | ✅ 弹出 toast |
| 4 `Ctrl+Alt+U` | ✅ 弹出 toast（键位合法，`bind` 保留） |
| 5 重启缓存 | ⏭️ **用户跳过，未验证**。若日后确认未持久化，`context.storage.store` 的落盘位置需再查（`~/.local/state/opencode/kv.json` 是 TUI 自己的设置，不是插件存储；疑似在 `opencode.db`） |
| 6 enabled 过滤 | ✅ 由 `src/providers/index.test.ts` 的 `enabledProviders` 单测覆盖（5 个用例），**未做 E2E** |

- [x] **Step 5: 验证失败提示不吞异常**

⚠️ **不要按原方案改名 `%APPDATA%\AI状态监控\config.json`** —— 桌面应用（AI状态监控）可能正在运行，
改名/改坏它可能被应用回写覆盖，甚至丢失用户填的 API Key。

安全的等价做法：临时把 `tui.tsx` 里那句改成指向一个不存在的路径，热重载后观察，验完改回来：

```ts
const { config, thresholds, error } = loadConfig('C:\\__ai_signal_light_missing__\\config.json');
```

Expected: 侧边栏只剩一行红色 `config.json 读取失败`，其余 provider 行消失；插件不崩
（`~/.local/share/opencode/log/opencode.log` 里没有 `plugin operation failed`）。**验完务必把参数删掉。**

**实际验证记录（2026-09-28）：** ✅ 用上述安全做法验过 —— 日志确认没有 `plugin operation failed`（插件未崩）。
红字的目视确认用户未单独回报（渲染通路与 provider 行同为 `<text>`，已由 1、2 项间接覆盖）。

- [x] **Step 6: 提交**

```powershell
git add opencode-plugin/src/tui.tsx
git commit -m "feat(opencode-plugin): 侧边栏轮询渲染、缓存与手动刷新命令"
```

---

## Task 8: README、spec 同步、记忆归档

**Files:**
- Create: `opencode-plugin/README.md`
- Modify: `docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md`
- Create: `.vibe-harness/plans/opencode-usage-sidebar.md`
- Create: `.vibe-harness/history/opencode-usage-sidebar.md`
- Modify: `.vibe-harness/index.md`

- [ ] **Step 1: 写 `opencode-plugin/README.md`**

内容必须包含以下小节，用实际验证结果填写（不要留占位符）：

````markdown
# opencode-usage-sidebar

opencode TUI 侧边栏插件：显示 Kimi / MiniMax / 火山 Coding Plan / DeepSeek / MiMo 用量。

## 数据来源

只读 `%APPDATA%\AI状态监控\config.json`（正式版 userData），**绝不写回** ——
cookie / CSRF 的续期回写由桌面应用独占，两边同时写会互相覆盖。

只渲染 `enabled === true` 的 provider；`enabled` 但 `token` 为空的那家会显示成灰色「未配置」（不静默隐藏）。

> ⚠️ 插件不读 `AI状态监控-dev`，也不支持环境变量覆盖路径。

## 加载方式

本插件通过 opencode 的**全局插件发现目录**加载，**不要**写进 `cli.json` 的 `plugins`（实测无效）。

`C:\Users\cari\.config\opencode\plugins\usage-sidebar\tui.ts`：

```ts
export { default } from '../../../../Documents/kimi/Workspaces/ai-signal-light/opencode-plugin/src/tui.tsx';
```

- 该文件在仓库外，**不受版本控制** —— 换机器/迁移仓库时要手动重建，路径也要跟着改。
- opencode 会自动发现 `~/.config/opencode/plugins/<name>/tui.ts`，`cli.json` 与 `opencode.jsonc` 都不用动。

### 为什么不用 cli.json

实测（opencode 2.0.14）：`cli.json` 的 `plugins` 里写本地路径**不会被加载，而且零日志**。失败的写法：

| 写法 | 结果 |
|---|---|
| `"file:///C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light/opencode-plugin"` | 不加载 |
| `"C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light/opencode-plugin"` | 不加载 |
| 上面两种 + 给包补 `"."` 主入口（`exports` 同时含 `"."` 与 `"./tui"`） | 不加载 |

判定方法：在 `setup()` 里临时 `appendFileSync` 一行，观察文件是否出现（详见实现计划 Task 1 Step 8）。

### 运行时依赖

`npm install` 是**运行时前提**，不只是开发前提：stub import 的 `src/tui.tsx` 位于本目录树内，
Bun 从这里向上解析 `@opencode/plugin/tui` 与 `solid-js`。删掉 `node_modules` 插件会加载失败。

## 配置项

| 项 | 位置 | 默认 |
|---|---|---|
| 刷新间隔 | `src/tui.tsx` 的 `REFRESH_MS` | 5 分钟 |
| 失败退避上限 | `src/tui.tsx` 的 `MAX_BACKOFF_MS` | 30 分钟 |
| 行格式 | `src/format.ts` 的 `LABEL_WIDTH` / `PERCENT_WIDTH` | 标签 2 列、百分比右对齐 4 列 |
| 告警阈值 | 读 config.json 的 `thresholds` | warn 50 / danger 80 |
| 快捷键 | 命令 ID `usage.refresh`，可在 cli.json 的 `keybinds` 覆盖 | `ctrl+alt+u`（若无效应在 cli.json 自行绑定） |

## 命令

- 斜杠命令 `/usage` —— 立即刷新
- 命令面板搜索「刷新供应商用量」

## 开发

```powershell
npm install --legacy-peer-deps   # 必须带这个 flag，否则 @opencode/theme 与 @opentui/* 会 ERESOLVE
npm test
npm run typecheck
```

调试：改完代码重开 `opencode`；插件加载错误看 `~/.local/share/opencode/log/opencode.log`。

## 与主进程实现的对应关系（改动必须两边同步）

| 本插件 | 主进程 |
|---|---|
| `src/providers/volcengine-sign.ts` | `src/main/volcengine-sign.ts` |
| `src/providers/kimi.ts` | `src/main/usage-monitor.ts` 的 `mapKimiUsages` / `calcPercent` |
| `src/providers/minimax.ts` | `src/main/usage-monitor.ts` 的 `fetchMiniMax` |
| `src/providers/deepseek.ts` | `src/main/usage-monitor.ts` 的 `mapDeepseekBalance` |
| `src/providers/mimo.ts` | `src/main/usage-monitor.ts` 的 `mapMimoBalance` |
| `src/providers/volcengine.ts` | `src/main/usage-monitor.ts` 的 `fetchVolcengine*` / `mapVolcengineUsage` |

## 已知限制（v1）

- 不做 Copilot / Codex
- 不支持代理转发（`useProxy`）；五家当前均为 false
- 火山 cookie 过期后只报错，不自动续期
- 主题色在 setup 时取一次，运行中切换主题需要重开
````

README 里**不允许留尖括号占位符**；「加载方式」一节必须写成实际生效的全局发现目录方案。

- [ ] **Step 2: 同步 spec（三处简化 + 加载方式 + 风险表）**

编辑 `docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md`：

1. 第 4 节目录树：删掉 `model.ts` 那一行；把 `providers/index.ts` 的注释从「provider 注册表（id、显示名、取数函数、窗口语义）」改成「PROVIDERS 数组（id、显示名、fetch）」。
2. 第 5 节数据流图：删掉 `model.ts：归一化为 ProviderView` 一行，改成「各 provider 直接产出 `windows` / `balance`；窗口选择与配色在 `format.ts`」。
3. 第 14 节实现顺序第 2 步：`config.ts` + `format.ts` + `model.ts` 改成 `config.ts` + `format.ts`。
4. 第 10 节「加载与注册」：整节改写为实测结论 —— **用全局发现目录 `~/.config/opencode/plugins/usage-sidebar/tui.ts`（一行 re-export）**，`cli.json` 保持原样；把原文里「Windows 下路径书写形式未明确，实现时实测」和 cli.json 兜底那段删掉，替换成「实测 `cli.json` 路径条目无效（`file:///C:/…`、裸绝对路径、补 `"."` 主入口三种都试过，零日志静默忽略）」。
5. 第 13 节风险表第 1 行：改成「`cli.json` 路径条目能否加载 → **已实测不能**，改用全局发现目录，已用落盘追踪证明 `setup()` 被调用」。

- [ ] **Step 3: 写 `.vibe-harness/plans/opencode-usage-sidebar.md`**

```markdown
# opencode 供应商用量侧边栏插件

- 时间：2026-09-28
- 目标：opencode TUI 侧边栏显示五家供应商用量，凭据只读应用 config.json
- 设计：docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md
- 实现计划：docs/superpowers/plans/2026-09-28-opencode-usage-sidebar.md
- 边界：不做 Copilot / Codex；不做代理；不写回 config.json
```

- [ ] **Step 4: 写 `.vibe-harness/history/opencode-usage-sidebar.md`**

按 AGENTS.md 的格式记录：改动摘要（新增 `opencode-plugin/` 独立包、加载方式、五家取数、侧边栏渲染）、影响范围（新增目录，不动桌面应用代码）、验证结果（E2E 实测现象、footgun：`--legacy-peer-deps`、MiniMax 剩余/已用语义、火山 200 带 Error、**`cli.json` 路径条目无效必须走全局发现目录**）。

- [ ] **Step 5: 更新 `.vibe-harness/index.md`**

按现有格式追加：

```markdown
## [opencode-usage-sidebar](plans/opencode-usage-sidebar.md) | [history](history/opencode-usage-sidebar.md)
- 时间：2026-09-28
- 范围：新增 opencode TUI 侧边栏插件（独立 npm 包 opencode-plugin/），显示 Kimi/MiniMax/火山/DeepSeek/MiMo 五家用量；凭据只读 %APPDATA%\AI状态监控\config.json；5 分钟轮询 + 失败退避 + 手动刷新
- 关联：`opencode-plugin/**`、`.gitignore`、`~/.config/opencode/cli.json`、`docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md`
```

- [ ] **Step 6: 提交**

```powershell
git add opencode-plugin/README.md docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md .vibe-harness
git commit -m "docs(opencode-plugin): README、spec 同步与记忆归档"
```

---

## 完成标准

- [ ] `opencode-plugin` 下 `npm test` 全绿、`npm run typecheck` 无错误
- [ ] `opencode` 启动后侧边栏稳定显示 `用量` 表头 + 5 家一行
- [ ] `/usage` 与快捷键都能触发刷新并弹汇总 toast
- [ ] 重启 opencode 先显示缓存再刷新
- [ ] config.json 缺失/损坏时只显示一行红字，不崩溃
- [ ] 桌面应用代码零改动；`git status` 里没有 `src/` 的改动
