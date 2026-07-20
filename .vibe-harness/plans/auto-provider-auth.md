# Provider 免手动认证 Implementation Plan

> **For agentic workers:** 按 Task 顺序执行，步骤用 `- [ ]` 跟踪。计划位置遵循项目 harness 约定（`.vibe-harness/plans/`，kebab-case，无日期），覆盖 skill 默认路径。
> **注意：** 不执行任何 `git commit`（系统规则禁止，除非用户明确要求）。

**Goal:** 用量认证/Provider 升级：(1) Kimi 自动读取本机 Kimi Code CLI 凭证（零配置）；(2) Copilot 改用 GitHub Device Flow OAuth 替代手动粘贴 Cookie；(3) 新增 DeepSeek provider（手动 API Key 查余额）；(4) 新增 Codex provider（自动读取本机 Codex CLI 凭证查速率窗口）。MiniMax 维持手动 API key 不变。

**Architecture:**
- 新增 `src/main/kimi-credentials.ts`：读 `~/.kimi-code/credentials/kimi-code.json`，access_token 过期时用 refresh_token 走 `POST https://auth.kimi.com/v1/oauth/token` 刷新并原子写回（与 CLI 自身行为一致）。
- 新增 `src/main/copilot-auth.ts`：GitHub Device Flow（client_id `Iv1.b507a08c87ecfe98`，copilot.vim 同款）拿到 `gho_` OAuth token 存入 `copilot.token` 字段；取用量时用 OAuth token 换 `api.github.com/copilot_internal/v2/token` 会话 token，再查 `copilot_internal/user` 的 `quota_snapshots`。`copilot.token` 以 `gho_`/`ghu_` 前缀区分 OAuth token 与旧 Cookie（无需改配置结构，旧 Cookie 路径保留作后备）。
- 新增 `src/main/codex-credentials.ts`：读 `~/.codex/auth.json`，access_token（JWT，约 6 天有效）过期时走 `POST https://auth.openai.com/oauth/token`（client_id `app_EMoamEEZ73f0CkXaXp7hrann`，Codex CLI 公开 client）刷新并合并写回。取数走 `GET https://chatgpt.com/backend-api/wham/usage`（已实测 200，返回 `rate_limit.primary_window/secondary_window`，窗口时长秒数可区分 5h/周）。
- DeepSeek 走 `GET https://api.deepseek.com/user/balance`（Bearer API Key），返回 `balance_infos[0]` 余额，无 5h/周窗口概念，UI 只显示余额文本。
- `UsageMonitor._safeRun` 增加可选 `resolveToken` 参数：配置 token 为空时尝试自动来源（Kimi / Codex）。

**Tech Stack:** Electron 主进程 (Node/CommonJS/axios)、Vue 3 设置窗口、Vitest。

---

## 修订记录（实施阶段更新，2026-07-20）

**Kimi 方案变更：CLI 凭证路线实测无效，改为内嵌登录窗口（Task 1-2 作废，以本节为准）。**

实施时实测发现：`~/.kimi-code/credentials/kimi-code.json` 的 OAuth token（scope=`kimi-code`，ES256）对用量接口 `www.kimi.com/apiv2/.../GetUsages` 返回 401——该接口只认 kimi.com 网页会话 token（user-center 签发的 HS512 JWT，约 30 天有效）。CLI 本地 server 仅 CLI 运行时存在，`/coding/v1/messages` 响应头也不带配额信息，无干净 API 路径。

最终方案（已实施）：

- 新建 `src/main/kimi-login.ts`：内嵌 BrowserWindow 打开 kimi.com（`persist:kimi-login` 分区持久化 cookie），`webRequest.onBeforeSendHeaders` 拦截 `www.kimi.com/apiv2/*` 请求抓取 Authorization 头的 Bearer token；忽略已过期 token，只保留比现有更新的；抓到即写 config、触发 checkAll、自动关窗。token 过期后重开窗口通常无需重新登录（cookie 还在）。
- 新 IPC：`kimi:login-start` / `kimi:login-result`（结果带 `tokenExp`）；`SETTINGS_GET` 返回 `kimiTokenExp`（解码现有 token 的 JWT exp），设置页显示「有效期至 yyyy-MM-dd」。
- 已删除 `kimi-credentials.ts` 及其测试；`_safeRun` 的 `resolveToken` 机制保留（Codex 在用），Kimi 不再使用。
- 另一个候选路线（读 kimi-desktop 的 LevelDB localStorage）经评估太脆弱，弃用。

**Codex 代理注意：** chatgpt.com 在本机需走代理（系统代理 Electron/axios 不会自动用），`codex.useProxy=true` + 全局代理后实测拉取成功（planType=plus，primary 周窗口 604800s）。

**端到端验证状态：** Kimi（既有手动 token）/ MiniMax / Codex 已在 dev 模式实测拉到真实数据；Copilot device flow 与 Kimi 登录窗口需用户交互验证；DeepSeek 需用户提供 API key 验证。

**已知限制（不在本期范围）：**
- Android 端自行轮询用量且假定 copilot.token 是 Cookie；桌面端改为 OAuth token 后，Android 的 Copilot 拉取会失效，需后续单独处理。
- `MobileAppConfig`（`toMobileConfig`）不投影 deepseek/codex，手机端看不到这两个 provider。
- 悬浮球只加 Codex 窗口 bar；DeepSeek 余额不进悬浮球。

---

## 文件结构

- 新建 `src/main/kimi-credentials.ts` — Kimi CLI 本地凭证读取/刷新（纯函数 + 薄网络层）
- 新建 `src/main/kimi-credentials.test.ts` — 纯函数测试
- 新建 `src/main/copilot-auth.ts` — Device Flow + 会话 token 换取 + 响应映射（纯函数 + 薄网络层）
- 新建 `src/main/copilot-auth.test.ts` — 纯函数测试
- 新建 `src/main/codex-credentials.ts` — Codex CLI 本地凭证读取/刷新（纯函数 + 薄网络层）
- 新建 `src/main/codex-credentials.test.ts` — 纯函数测试
- 修改 `src/shared/types/usage.ts` — ProviderId 加 `deepseek`/`codex`，新增 DeepseekUsageData / CodexUsageData
- 修改 `src/shared/types/config.ts` — AppConfig / ConfigPartial 加 deepseek/codex
- 修改 `src/main/config.ts` — DEFAULTS / _load / update 加 deepseek/codex
- 修改 `src/main/usage-monitor.ts` — kimi/copilot token 解析与 OAuth 取数路径；新增 fetchDeepseek / fetchCodex；state 初始化加两个 provider
- 修改 `src/main/usage-monitor.test.ts` — mapDeepseekBalance / mapWhamUsage 纯函数测试
- 修改 `src/main/main.ts` — `SETTINGS_GET` 增加自动凭证状态；SETTINGS_SAVE 加 deepseek；新增 device flow IPC handler
- 修改 `src/main/server.ts` — usageInit 快照加 deepseek/codex 与 enabled 映射
- 修改 `src/main/preload.ts` — 暴露 device flow API
- 修改 `src/shared/types/ipc.ts` — 新通道常量与类型
- 修改 `src/renderer/src/types/messages.ts` — UsageState / UsageInitPayload 加 deepseek/codex
- 修改 `src/renderer/src/composables/useUsageState.ts` — 新 provider 的 ref/消息分支/slot
- 修改 `src/renderer/src/components/UsageCard.vue` — DeepSeek 余额行、Codex 窗口 bar
- 修改 `src/renderer/src/App.vue` — usage 聚合对象加 deepseek/codex
- 修改 `src/renderer/src/FloatingBall.vue` — Codex 窗口 bar 行
- 修改 `src/renderer/src/Settings.vue` — Kimi/Codex 自动凭证提示；Copilot「连接 GitHub」；DeepSeek API Key 区块

---

### Task 1: Kimi 本地凭证模块（纯函数 + 测试）

**Files:**
- Create: `src/main/kimi-credentials.ts`
- Test: `src/main/kimi-credentials.test.ts`

- [ ] **Step 1: 写失败测试** `src/main/kimi-credentials.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  decodeJwtPayload,
  isAccessTokenValid,
  parseKimiCredentials,
} from './kimi-credentials';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64(payload)}.fakesig`;
}

describe('decodeJwtPayload', () => {
  it('解析合法 JWT 的 payload', () => {
    const token = makeJwt({ client_id: 'abc-123', exp: 1784509158 });
    expect(decodeJwtPayload(token)).toEqual({ client_id: 'abc-123', exp: 1784509158 });
  });
  it('非三段式 token 返回 null', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
  });
  it('payload 非 JSON 返回 null', () => {
    expect(decodeJwtPayload('aaa.!!!.ccc')).toBeNull();
  });
});

describe('isAccessTokenValid', () => {
  const base = { access_token: 'tok', refresh_token: 'ref', expires_at: 0 };
  it('expires_at 距现在超过 60s 缓冲期 → 有效', () => {
    expect(isAccessTokenValid({ ...base, expires_at: 1000 + 61 }, 1000)).toBe(true);
  });
  it('expires_at 在缓冲期内或已过期 → 无效', () => {
    expect(isAccessTokenValid({ ...base, expires_at: 1000 + 60 }, 1000)).toBe(false);
    expect(isAccessTokenValid({ ...base, expires_at: 999 }, 1000)).toBe(false);
  });
  it('access_token 为空 → 无效', () => {
    expect(isAccessTokenValid({ ...base, access_token: '', expires_at: 99999 }, 1000)).toBe(false);
  });
});

describe('parseKimiCredentials', () => {
  it('解析完整凭证 JSON', () => {
    const raw = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 123 });
    expect(parseKimiCredentials(raw)).toEqual({ access_token: 'a', refresh_token: 'r', expires_at: 123 });
  });
  it('缺字段/非法 JSON 返回 null', () => {
    expect(parseKimiCredentials('{}')).toBeNull();
    expect(parseKimiCredentials('{"access_token":"a"}')).toBeNull();
    expect(parseKimiCredentials('not json')).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/kimi-credentials.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `src/main/kimi-credentials.ts`

```ts
/**
 * Kimi Code CLI 本地凭证读取与刷新
 * 凭证位于 ~/.kimi-code/credentials/kimi-code.json（access_token 15 分钟有效，refresh_token 30 天）
 * 过期时走 OAuth refresh_token grant 刷新并原子写回（与 CLI 自身行为一致）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import axios, { AxiosProxyConfig } from 'axios';

export interface KimiCliCredentials {
  access_token: string;
  refresh_token: string;
  /** 秒级 Unix 时间戳 */
  expires_at: number;
}

const KIMI_AUTH_TOKEN_URL = 'https://auth.kimi.com/v1/oauth/token';
const REQUEST_TIMEOUT_MS = 8000;
/** access_token 剩余有效期不足该值时提前刷新 */
const EXPIRY_BUFFER_SEC = 60;

export function kimiCredentialsPath(): string {
  return path.join(os.homedir(), '.kimi-code', 'credentials', 'kimi-code.json');
}

/** 解码 JWT payload（不验签，仅读取 client_id 等声明） */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function isAccessTokenValid(
  creds: KimiCliCredentials,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  return typeof creds.access_token === 'string' && creds.access_token.length > 0
    && Number.isFinite(creds.expires_at)
    && creds.expires_at > nowSec + EXPIRY_BUFFER_SEC;
}

/** 解析凭证文件内容，缺关键字段返回 null */
export function parseKimiCredentials(raw: string): KimiCliCredentials | null {
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    if (typeof json.access_token !== 'string' || !json.access_token) return null;
    if (typeof json.refresh_token !== 'string' || !json.refresh_token) return null;
    if (typeof json.expires_at !== 'number') return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
    };
  } catch {
    return null;
  }
}

/** 读取本机 Kimi Code CLI 凭证，文件不存在或损坏返回 null */
export function readKimiCliCredentials(): KimiCliCredentials | null {
  try {
    const p = kimiCredentialsPath();
    if (!fs.existsSync(p)) return null;
    return parseKimiCredentials(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 原子写回凭证（tmp + rename，与 ConfigStore 同一套路） */
function writeKimiCredentials(creds: KimiCliCredentials): void {
  const p = kimiCredentialsPath();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(creds, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

/** 用 refresh_token 换新凭证并写回文件；失败抛错 */
export async function refreshKimiCredentials(
  creds: KimiCliCredentials,
  proxyConfig: AxiosProxyConfig | null
): Promise<KimiCliCredentials> {
  const payload = decodeJwtPayload(creds.access_token);
  const clientId = payload?.client_id;
  if (typeof clientId !== 'string' || !clientId) {
    throw new Error('local credentials missing client_id');
  }
  const res = await axios.post(
    KIMI_AUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: clientId,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: REQUEST_TIMEOUT_MS,
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    }
  );
  const data = res.data as Record<string, unknown>;
  if (!data || typeof data.access_token !== 'string') {
    throw new Error(`refresh failed: HTTP ${res.status}`);
  }
  const next: KimiCliCredentials = {
    access_token: data.access_token,
    refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : creds.refresh_token,
    expires_at: typeof data.expires_at === 'number'
      ? data.expires_at
      : Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 900),
  };
  writeKimiCredentials(next);
  return next;
}

/**
 * 获取可用的 Kimi access_token：本地有效直接用，过期自动刷新。
 * 无本地凭证或刷新失败返回 null（调用方回退到 no_token 错误态）。
 */
export async function getKimiAccessToken(proxyConfig: AxiosProxyConfig | null): Promise<string | null> {
  const creds = readKimiCliCredentials();
  if (!creds) return null;
  if (isAccessTokenValid(creds)) return creds.access_token;
  try {
    const next = await refreshKimiCredentials(creds, proxyConfig);
    console.log('[usage:kimi] local credentials refreshed');
    return next.access_token;
  } catch (e) {
    console.warn('[usage:kimi] refresh local credentials failed:', (e as Error).message);
    return null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/main/kimi-credentials.test.ts`
Expected: 9 个用例 PASS

---

### Task 2: UsageMonitor 接入 Kimi 自动凭证 + 设置页提示

**Files:**
- Modify: `src/main/usage-monitor.ts`（`_safeRun` 与 `checkAll`）
- Modify: `src/main/main.ts`（`SETTINGS_GET` handler，main.ts:551-573）
- Modify: `src/renderer/src/Settings.vue`（Kimi section，约 275-308 行）

- [ ] **Step 1: 改 `_safeRun` 支持 token 自动解析**（`src/main/usage-monitor.ts`）

`checkAll` 改为：

```ts
  // 主入口：依次检查所有 provider
  async checkAll(): Promise<void> {
    await Promise.all([
      this._safeRun('kimi',    this.fetchKimi.bind(this),    (proxy) => getKimiAccessToken(proxy)),
      this._safeRun('minimax', this.fetchMiniMax.bind(this)),
      this._safeRun('copilot', this.fetchCopilot.bind(this))
    ]);
  }
```

`_safeRun` 签名与 token 解析段改为（其余逻辑不变）：

```ts
  private async _safeRun(
    provider: ProviderId,
    fetcher: (token: string, proxy: AxiosProxyConfig | null) => Promise<ProviderUsageData>,
    resolveToken?: (proxy: AxiosProxyConfig | null) => Promise<string | null>
  ): Promise<void> {
    const cfg = this.configStore.get()[provider];
    if (!cfg.enabled) {
      this.state[provider] = {
        ...this.state[provider],
        error: 'disabled'
      };
      this._emit(provider);
      return;
    }

    const globalProxy = this.configStore.get().proxy?.url;
    const proxyConfig = cfg.useProxy && globalProxy ? parseProxyUrl(globalProxy) : null;

    // 手动 token 优先；为空时尝试自动来源（如 Kimi 本地 CLI 凭证）
    let token = cfg.token;
    if (!token && resolveToken) {
      token = (await resolveToken(proxyConfig)) || '';
    }
    if (!token) {
      this.state[provider] = {
        ...this.state[provider],
        error: 'no_token'
      };
      this._emit(provider);
      return;
    }

    try {
      const data = await fetcher(token, proxyConfig);
      this.state[provider] = {
        data,
        lastUpdated: new Date().toISOString(),
        error: null
      };
    } catch (e) {
      const msg = formatAxiosError(e);
      console.warn(`[usage:${provider}] fetch failed:`, msg);
      this.state[provider] = {
        ...this.state[provider],
        lastUpdated: new Date().toISOString(),
        error: msg
      };
    }
    this._emit(provider);
  }
```

文件顶部 import 增加：

```ts
import { getKimiAccessToken } from './kimi-credentials';
```

注意：原 `_safeRun` 里 `const globalProxy = ...` 两行从 try 块内上移（因为现在 token 解析也要用 proxyConfig），确认 `parseProxyUrl` 已在文件内定义（usage-monitor.ts:345 已有，无需移动）。

- [ ] **Step 2: `SETTINGS_GET` 暴露本地凭证可用性**（`src/main/main.ts` handler 内，return 对象中追加）

```ts
    kimiAutoAvailable: !!readKimiCliCredentials(),
```

并在 main.ts 顶部 import：

```ts
import { readKimiCliCredentials } from './kimi-credentials';
```

`src/shared/types/ipc.ts` 的 `SettingsPayload` 增加：

```ts
  kimiAutoAvailable: boolean;
```

- [ ] **Step 3: 设置页 Kimi 区提示**（`src/renderer/src/Settings.vue`）

script 中新增响应式状态，并在 `onMounted` 读取：

```ts
const kimiAutoAvailable = ref<boolean>(false);
```

`onMounted` 里 `await window.electronAPI.getSettings()` 之后加：

```ts
  kimiAutoAvailable.value = !!cfg.kimiAutoAvailable;
```

模板 Kimi section 的 token 输入框 `</div>`（`settings-input-wrap` 结束）之后加：

```html
          <div class="settings-hint" v-if="!kimi.hasToken && kimiAutoAvailable">
            已检测到本机 Kimi Code 登录凭证，留空将自动使用（手动填写可覆盖）。
          </div>
          <div class="settings-hint" v-else-if="!kimi.hasToken">
            留空时自动读取本机 Kimi Code 凭证（需安装并登录 Kimi Code CLI）。
          </div>
```

- [ ] **Step 4: 验证**

Run: `npm run typecheck && npx vitest run src/main/usage-monitor.test.ts`
Expected: typecheck 无错；既有 usage-monitor 测试 PASS

---

### Task 3: Copilot Device Flow 模块（纯函数 + 测试）

**Files:**
- Create: `src/main/copilot-auth.ts`
- Test: `src/main/copilot-auth.test.ts`

- [ ] **Step 1: 写失败测试** `src/main/copilot-auth.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { isCopilotOAuthToken, mapCopilotUserResponse } from './copilot-auth';

describe('isCopilotOAuthToken', () => {
  it('gho_/ghu_ 前缀识别为 OAuth token', () => {
    expect(isCopilotOAuthToken('gho_abcdef')).toBe(true);
    expect(isCopilotOAuthToken('ghu_abcdef')).toBe(true);
  });
  it('Cookie 串/空串不是 OAuth token', () => {
    expect(isCopilotOAuthToken('_octo=abc; logged_in=yes')).toBe(false);
    expect(isCopilotOAuthToken('')).toBe(false);
  });
});

describe('mapCopilotUserResponse', () => {
  it('映射 quota_snapshots 为 CopilotUsageData（percent 为已用 %）', () => {
    const json = {
      copilot_plan: 'individual_pro',
      access_type_sku: 'copilot_for_individuals',
      quota_reset_date: '2026-08-01',
      quota_reset_date_utc: '2026-08-01T00:00:00Z',
      quota_snapshots: {
        premium_interactions: { entitlement: 300, remaining: 120, percent_remaining: 40, unlimited: false },
        chat: { entitlement: 1000, remaining: 250, percent_remaining: 25, unlimited: false },
      },
    };
    expect(mapCopilotUserResponse(json)).toEqual({
      premium: {
        limit: 300,
        remaining: 120,
        percent: 60, // (300-120)/300
        resetDate: '2026-08-01',
        resetDateUtc: '2026-08-01T00:00:00Z',
      },
      chat: { percent: 75 }, // 100 - 25
      plan: 'individual_pro',
      licenseType: 'copilot_for_individuals',
    });
  });
  it('entitlement 为 0 时 percent 为 0', () => {
    const json = { quota_snapshots: { premium_interactions: { entitlement: 0, remaining: 0 } } };
    const r = mapCopilotUserResponse(json);
    expect(r.premium.percent).toBe(0);
  });
  it('缺字段时容错为 null/0', () => {
    const r = mapCopilotUserResponse({});
    expect(r.plan).toBeNull();
    expect(r.chat.percent).toBe(0);
    expect(r.premium.resetDate).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/copilot-auth.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `src/main/copilot-auth.ts`

```ts
/**
 * GitHub Copilot Device Flow 认证与用量查询
 * 流程：github.com/login/device/code 拿 user_code → 用户浏览器确认 →
 * 轮询 login/oauth/access_token 拿 gho_ OAuth token（长期有效，存入配置）→
 * 用 OAuth token 换 copilot_internal 会话 token → 查 copilot_internal/user 的 quota_snapshots
 */

import axios, { AxiosProxyConfig } from 'axios';
import type { CopilotUsageData } from '../shared/types/usage';
import { calcPercent } from './usage-monitor';

/** copilot.vim / copilot.lua 共用的公开 OAuth client_id */
export const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_USER_URL = 'https://api.github.com/copilot_internal/user';
const REQUEST_TIMEOUT_MS = 8000;
/** 会话 token 过期前提前刷新的缓冲 */
const SESSION_EXPIRY_BUFFER_MS = 60_000;

const GITHUB_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'ai-status-monitor',
};

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** 服务端要求的轮询间隔（秒） */
  interval: number;
  expiresIn: number;
}

/** 判断 copilot.token 字段里存的是不是 OAuth token（否则按旧 Cookie 处理） */
export function isCopilotOAuthToken(token: string): boolean {
  return token.startsWith('gho_') || token.startsWith('ghu_');
}

function axiosConfig(proxyConfig: AxiosProxyConfig | null) {
  return {
    headers: { ...GITHUB_HEADERS },
    timeout: REQUEST_TIMEOUT_MS,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  };
}

/** 第一步：申请设备码 */
export async function startDeviceFlow(proxyConfig: AxiosProxyConfig | null): Promise<DeviceCodeInfo> {
  const res = await axios.post(
    DEVICE_CODE_URL,
    new URLSearchParams({ client_id: COPILOT_CLIENT_ID, scope: 'read:user' }).toString(),
    axiosConfig(proxyConfig)
  );
  const data = res.data as Record<string, unknown>;
  if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
    throw new Error(`device code request failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: String(data.verification_uri || 'https://github.com/login/device'),
    interval: Number(data.interval) || 5,
    expiresIn: Number(data.expires_in) || 900,
  };
}

/** 第二步：轮询换取 OAuth token。shouldCancel 返回 true 时中止。 */
export async function pollDeviceFlow(
  info: DeviceCodeInfo,
  proxyConfig: AxiosProxyConfig | null,
  shouldCancel: () => boolean
): Promise<string> {
  const deadline = Date.now() + info.expiresIn * 1000;
  let intervalMs = info.interval * 1000;

  while (Date.now() < deadline) {
    if (shouldCancel()) throw new Error('cancelled');
    await new Promise(r => setTimeout(r, intervalMs));

    const res = await axios.post(
      ACCESS_TOKEN_URL,
      new URLSearchParams({
        client_id: COPILOT_CLIENT_ID,
        device_code: info.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
      axiosConfig(proxyConfig)
    );
    const data = res.data as Record<string, unknown>;
    if (typeof data.access_token === 'string') return data.access_token;

    switch (data.error) {
      case 'authorization_pending': continue;
      case 'slow_down': intervalMs += 5000; continue;
      case 'expired_token': throw new Error('授权码已过期，请重新发起');
      case 'access_denied': throw new Error('用户拒绝了授权');
      default: throw new Error(`授权失败: ${String(data.error_description || data.error || 'unknown')}`);
    }
  }
  throw new Error('授权超时，请重新发起');
}

/** 第三步（缓存）：OAuth token → copilot_internal 会话 token */
export class CopilotSessionCache {
  private token: string | null = null;
  private expiresAtMs = 0;

  async getSessionToken(githubToken: string, proxyConfig: AxiosProxyConfig | null): Promise<string> {
    if (this.token && Date.now() < this.expiresAtMs - SESSION_EXPIRY_BUFFER_MS) {
      return this.token;
    }
    const res = await axios.get(COPILOT_TOKEN_URL, {
      ...axiosConfig(proxyConfig),
      headers: { ...GITHUB_HEADERS, 'Authorization': `token ${githubToken}` },
    });
    const data = res.data as Record<string, unknown>;
    if (typeof data.token !== 'string') {
      throw new Error(`copilot session token failed: HTTP ${res.status}`);
    }
    this.token = data.token;
    this.expiresAtMs = typeof data.expires_at === 'string'
      ? Date.parse(data.expires_at)
      : Date.now() + 25 * 60 * 1000;
    return this.token;
  }

  clear(): void {
    this.token = null;
    this.expiresAtMs = 0;
  }
}

/** 第四步：会话 token → quota_snapshots */
export async function fetchCopilotUser(sessionToken: string, proxyConfig: AxiosProxyConfig | null): Promise<CopilotUsageData> {
  const res = await axios.get(COPILOT_USER_URL, {
    ...axiosConfig(proxyConfig),
    headers: { ...GITHUB_HEADERS, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data || {}).slice(0, 200)}`);
  }
  const json = res.data as Record<string, unknown>;
  if (!json || typeof json !== 'object' || !json.quota_snapshots) {
    throw new Error('invalid response, oauth token may lack copilot access');
  }
  return mapCopilotUserResponse(json);
}

/** 纯函数：copilot_internal/user 响应 → CopilotUsageData（percent 语义为已用 %） */
export function mapCopilotUserResponse(json: Record<string, unknown>): CopilotUsageData {
  const qs = (json.quota_snapshots as Record<string, unknown>) || {};
  const premium = (qs.premium_interactions as Record<string, unknown>) || {};
  const chat = (qs.chat as Record<string, unknown>) || {};

  const entitlement = Number(premium.entitlement) || 0;
  const remaining = Number(premium.remaining) || 0;
  const chatPercentRemaining = Number(chat.percent_remaining);

  return {
    premium: {
      limit: entitlement,
      remaining,
      percent: calcPercent(entitlement - remaining, entitlement),
      resetDate: json.quota_reset_date ? String(json.quota_reset_date) : null,
      resetDateUtc: json.quota_reset_date_utc ? String(json.quota_reset_date_utc) : null,
    },
    chat: { percent: Number.isFinite(chatPercentRemaining) ? Math.max(0, Math.min(100, 100 - chatPercentRemaining)) : 0 },
    plan: json.copilot_plan ? String(json.copilot_plan) : null,
    licenseType: json.access_type_sku ? String(json.access_type_sku) : null,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/main/copilot-auth.test.ts`
Expected: 5 个用例 PASS

---

### Task 4: UsageMonitor 接入 Copilot OAuth 取数路径

**Files:**
- Modify: `src/main/usage-monitor.ts`

- [ ] **Step 1: `fetchCopilot` 按 token 形态分流**

`src/main/usage-monitor.ts` 顶部 import 增加：

```ts
import { CopilotSessionCache, fetchCopilotUser, isCopilotOAuthToken } from './copilot-auth';
```

类内新增成员（构造函数之前）：

```ts
  private copilotSession = new CopilotSessionCache();
```

`fetchCopilot` 方法开头改为分流（保留原 Cookie 路径作为 else 分支，逐字不动）：

```ts
  // token 字段兼容两种形态：gho_/ghu_ 开头的 GitHub OAuth token（device flow），否则是旧版浏览器 Cookie
  private async fetchCopilot(token: string, proxyConfig: AxiosProxyConfig | null): Promise<CopilotUsageData> {
    const trimmed = token.trim();
    if (isCopilotOAuthToken(trimmed)) {
      const sessionToken = await this.copilotSession.getSessionToken(trimmed, proxyConfig);
      const data = await fetchCopilotUser(sessionToken, proxyConfig);
      console.log('[usage:copilot] fetched data (oauth):', data);
      return data;
    }
    return this.fetchCopilotByCookie(trimmed, proxyConfig);
  }
```

原方法体重命名为 `fetchCopilotByCookie(cookie: string, proxyConfig: AxiosProxyConfig | null)`，方法内不再 `cookie.trim()`（调用方已 trim），其余不变。

注意：`copilot-auth.ts` import 了 `usage-monitor.ts` 的 `calcPercent`，而 `usage-monitor.ts` import `copilot-auth.ts` —— CommonJS 循环引用。`calcPercent` 是纯函数且在模块顶层导出，tsc/CommonJS 下可用但顺序敏感；为消除隐患，把 `calcPercent` 上移到 `src/shared/utils/` 不合适（改动面变大）。**决策：** `copilot-auth.ts` 内联自己的 percent 计算，不 import usage-monitor：

```ts
// copilot-auth.ts 内部，替代 calcPercent import
function percentUsed(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}
```

`mapCopilotUserResponse` 中 `calcPercent(entitlement - remaining, entitlement)` 改为 `percentUsed(entitlement - remaining, entitlement)`。

- [ ] **Step 2: 验证**

Run: `npm run typecheck && npm test`
Expected: typecheck 无错；全部测试 PASS

---

### Task 5: Device Flow IPC + 设置页 UI

**Files:**
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/main/main.ts`
- Modify: `src/renderer/src/Settings.vue`

- [ ] **Step 1: 类型与通道**（`src/shared/types/ipc.ts`）

`IPC_CHANNELS` 增加：

```ts
  COPILOT_DEVICE_START: 'copilot:device-start',
  COPILOT_DEVICE_CANCEL: 'copilot:device-cancel',
  COPILOT_DEVICE_RESULT: 'copilot:device-result',
```

新增类型并在 `ElectronAPI` 增加方法：

```ts
export interface CopilotDeviceStartResult {
  success: boolean;
  userCode?: string;
  verificationUri?: string;
  error?: string;
}

export interface CopilotDeviceResult {
  success: boolean;
  error?: string;
}
```

```ts
  copilotStartDeviceFlow: () => Promise<CopilotDeviceStartResult>;
  copilotCancelDeviceFlow: () => Promise<void>;
  onCopilotDeviceResult: (cb: (r: CopilotDeviceResult) => void) => void;
```

`SettingsPayload` 增加：

```ts
  copilotOAuth: boolean;
```

- [ ] **Step 2: preload**（`src/main/preload.ts`）

`IPC_CHANNELS` 常量同步加三项（与 ipc.ts 一致），`exposeInMainWorld` 对象内加：

```ts
  // Copilot Device Flow 授权
  copilotStartDeviceFlow: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_DEVICE_START),
  copilotCancelDeviceFlow: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_DEVICE_CANCEL),
  onCopilotDeviceResult: (cb: (r: { success: boolean; error?: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.COPILOT_DEVICE_RESULT, (_e, r) => cb(r)),
```

同时检查 `src/renderer/src/types/electron.d.ts`（或 Settings.vue import 的 `./types/electron`）里的 `ElectronAPI` 声明，同步加这三个方法（renderer 用的是自己的一份类型拷贝，见 Settings.vue:3 `import type { SettingsSavePayload } from './types/electron'`）。

- [ ] **Step 3: 主进程 handler**（`src/main/main.ts`）

顶部 import：

```ts
import { startDeviceFlow, pollDeviceFlow, isCopilotOAuthToken } from './copilot-auth';
import { shell } from 'electron'; // 若已有 electron import 则并入
```

模块级状态：

```ts
let copilotDeviceCancelled = false;
```

新增 handler（放在 `SETTINGS_CLOSE` handler 附近）：

```ts
ipcMain.handle(IPC_CHANNELS.COPILOT_DEVICE_START, async () => {
  if (!configStore) return { success: false, error: 'no config' };
  try {
    copilotDeviceCancelled = false;
    const proxy = parseProxyUrl(configStore.get().proxy?.url || '');
    const info = await startDeviceFlow(proxy);
    // 自动打开浏览器授权页
    shell.openExternal(info.verificationUri).catch(() => {});
    // 后台轮询，完成后写配置并通知设置窗口
    pollDeviceFlow(info, proxy, () => copilotDeviceCancelled)
      .then((token) => {
        configStore!.update({ copilot: { token } });
        if (usageMonitor) usageMonitor.checkAll();
        rebuildTray();
        sendCopilotDeviceResult({ success: true });
      })
      .catch((e: Error) => {
        if (e.message !== 'cancelled') {
          sendCopilotDeviceResult({ success: false, error: e.message });
        }
      });
    return { success: true, userCode: info.userCode, verificationUri: info.verificationUri };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.COPILOT_DEVICE_CANCEL, async () => {
  copilotDeviceCancelled = true;
});

function sendCopilotDeviceResult(r: { success: boolean; error?: string }): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(IPC_CHANNELS.COPILOT_DEVICE_RESULT, r);
  }
}
```

注意确认 main.ts 中 settingsWindow 变量名（`settings:close` handler 用到，main.ts:638 附近）与 `rebuildTray`、`parseProxyUrl` 的既有 import —— `parseProxyUrl` 若未 import 需从 `./usage-monitor` 引入。`configStore.get().proxy?.url` 为空串时 `parseProxyUrl('')` 返回 null，安全。

`SETTINGS_GET` 返回对象追加：

```ts
    copilotOAuth: isCopilotOAuthToken(cfg.copilot.token || ''),
```

- [ ] **Step 4: 设置页 Copilot 区 UI**（`src/renderer/src/Settings.vue`）

script 新增：

```ts
const copilotOAuth = ref<boolean>(false);
const deviceFlowBusy = ref<boolean>(false);
const deviceUserCode = ref<string>('');
const deviceStatus = ref<string>('');

async function startCopilotDeviceFlow() {
  if (!window.electronAPI) return;
  deviceFlowBusy.value = true;
  deviceStatus.value = '';
  deviceUserCode.value = '';
  const r = await window.electronAPI.copilotStartDeviceFlow();
  if (r.success && r.userCode) {
    deviceUserCode.value = r.userCode;
    deviceStatus.value = '已在浏览器打开授权页，请输入上方验证码';
  } else {
    deviceFlowBusy.value = false;
    deviceStatus.value = '发起失败: ' + (r.error || '未知错误');
  }
}

async function cancelCopilotDeviceFlow() {
  if (!window.electronAPI) return;
  await window.electronAPI.copilotCancelDeviceFlow();
  deviceFlowBusy.value = false;
  deviceUserCode.value = '';
  deviceStatus.value = '已取消';
}
```

`onMounted` 中 getSettings 之后加：

```ts
  copilotOAuth.value = !!cfg.copilotOAuth;
```

`onMounted` 末尾注册结果监听：

```ts
  window.electronAPI.onCopilotDeviceResult((r) => {
    deviceFlowBusy.value = false;
    deviceUserCode.value = '';
    if (r.success) {
      copilotOAuth.value = true;
      copilot.hasToken = true;
      deviceStatus.value = '已连接 GitHub 账号，保存后生效';
    } else {
      deviceStatus.value = '授权失败: ' + (r.error || '未知错误');
    }
  });
```

模板 Copilot section 的「使用代理」field 之后、Cookie field 之前插入：

```html
        <div class="settings-field">
          <label class="settings-label">GitHub 账号授权（推荐）</label>
          <div class="settings-row">
            <button type="button" class="btn-secondary" :disabled="deviceFlowBusy" @click="startCopilotDeviceFlow">
              {{ deviceFlowBusy ? '等待授权中...' : (copilotOAuth ? '重新连接 GitHub' : '连接 GitHub') }}
            </button>
            <button type="button" class="btn-secondary" v-if="deviceFlowBusy" @click="cancelCopilotDeviceFlow">取消</button>
          </div>
          <div class="settings-hint" v-if="deviceUserCode" style="font-size: 16px; letter-spacing: 2px;">
            验证码：<strong>{{ deviceUserCode }}</strong>
          </div>
          <div class="settings-hint" v-if="deviceStatus">{{ deviceStatus }}</div>
          <div class="settings-hint" v-else-if="copilotOAuth">已通过 GitHub OAuth 连接（保存后覆盖旧 Cookie）。</div>
        </div>
```

Cookie field 的 label 改为 `Cookie（备选，优先使用上方授权）`。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm test`
Expected: 全部通过

---

### Task 7: 类型与配置扩展（deepseek / codex）

**Files:**
- Modify: `src/shared/types/usage.ts`
- Modify: `src/shared/types/config.ts`
- Modify: `src/main/config.ts`
- Modify: `src/renderer/src/types/messages.ts`
- Modify: `src/main/server.ts`

- [ ] **Step 1: usage 类型**（`src/shared/types/usage.ts`）

```ts
export type ProviderId = 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex';
```

追加：

```ts
export interface DeepseekUsageData {
  isAvailable: boolean;
  currency: string | null;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}

export interface CodexWindowData {
  /** 已用 %（服务端 used_percent 原样） */
  usedPercent: number;
  /** 窗口时长（秒），UI 据此判断显示 5h / day / week */
  windowSeconds: number;
  /** 秒级 Unix 时间戳 */
  resetAt: number | null;
}

export interface CodexUsageData {
  planType: string | null;
  primary: CodexWindowData | null;
  secondary: CodexWindowData | null;
  creditsBalance: string | null;
}
```

`ProviderUsageData` 改为：

```ts
export type ProviderUsageData = KimiUsageData | MinimaxUsageData | CopilotUsageData | DeepseekUsageData | CodexUsageData;
```

- [ ] **Step 2: config 类型与存储**（`src/shared/types/config.ts`、`src/main/config.ts`）

`AppConfig` 增加：

```ts
  deepseek: ProviderConfig;
  codex: ProviderConfig;
```

`ConfigPartial` 增加 `deepseek?: Partial<ProviderConfig>; codex?: Partial<ProviderConfig>;`。

`src/main/config.ts` DEFAULTS 增加：

```ts
  deepseek: { token: '', enabled: true, useProxy: false },
  codex:   { token: '', enabled: true, useProxy: false },
```

`_load` 的 return 对象增加：

```ts
        deepseek: { ...DEFAULTS.deepseek, ...(parsed.deepseek || {}) },
        codex:   { ...DEFAULTS.codex,   ...(parsed.codex   || {}) },
```

`update` 增加分支（仿 kimi 分支）：

```ts
    if (partial.deepseek && typeof partial.deepseek === 'object') {
      this.data.deepseek = { ...this.data.deepseek, ...partial.deepseek };
    }
    if (partial.codex && typeof partial.codex === 'object') {
      this.data.codex = { ...this.data.codex, ...partial.codex };
    }
```

- [ ] **Step 3: 渲染层消息类型**（`src/renderer/src/types/messages.ts`）

re-export 列表的 usage 段增加 `DeepseekUsageData, CodexUsageData, CodexWindowData`。`UsageState` 与 `UsageInitPayload` 各增加：

```ts
  deepseek: import('../../../shared/types/usage').UsageProviderState | null;
  codex: import('../../../shared/types/usage').UsageProviderState | null;
```

- [ ] **Step 4: server.ts usageInit**（`src/main/server.ts:78-90`）

`data` 对象增加：

```ts
            deepseek: this.usageMonitor.state.deepseek,
            codex:   this.usageMonitor.state.codex,
```

`enabled` 映射增加 `deepseek: cfg.deepseek.enabled, codex: cfg.codex.enabled`，fallback 对象同步加 `deepseek: true, codex: true`。

- [ ] **Step 5: 验证**

Run: `npm run typecheck`
Expected: 报错只剩「usage-monitor state 缺 deepseek/codex」「App.vue usage 缺键」等下一 Task 会修的点；无其他意外错误

---

### Task 8: DeepSeek provider（手动 API Key）

**Files:**
- Modify: `src/main/usage-monitor.ts`（state、checkAll、fetchDeepseek、纯函数 mapDeepseekBalance）
- Modify: `src/main/usage-monitor.test.ts`
- Modify: `src/main/main.ts`（SETTINGS_GET/SAVE 加 deepseek）
- Modify: `src/shared/types/ipc.ts`（SettingsSavePayload）
- Modify: `src/renderer/src/Settings.vue`

- [ ] **Step 1: 失败测试**（追加到 `src/main/usage-monitor.test.ts`）

```ts
import { mapDeepseekBalance } from './usage-monitor';

describe('mapDeepseekBalance', () => {
  it('取 balance_infos[0] 并解析数字', () => {
    const json = {
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '5.00', topped_up_balance: '7.34' }],
    };
    expect(mapDeepseekBalance(json)).toEqual({
      isAvailable: true, currency: 'CNY', totalBalance: 12.34, grantedBalance: 5, toppedUpBalance: 7.34,
    });
  });
  it('balance_infos 为空抛错', () => {
    expect(() => mapDeepseekBalance({ is_available: false, balance_infos: [] })).toThrow();
  });
});
```

- [ ] **Step 2: 实现**（`src/main/usage-monitor.ts`）

state 初始化增加：

```ts
    deepseek: { data: null, lastUpdated: null, error: null },
    codex:   { data: null, lastUpdated: null, error: null }
```

`checkAll` 的 Promise.all 增加：

```ts
      this._safeRun('deepseek', this.fetchDeepseek.bind(this)),
      this._safeRun('codex',    this.fetchCodex.bind(this),
        async (proxy) => (await getCodexAuth(proxy)) ? 'local' : null)
```

常量与 fetcher：

```ts
const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';
```

```ts
  // ==================== DeepSeek ====================

  private async fetchDeepseek(token: string, proxyConfig: AxiosProxyConfig | null): Promise<DeepseekUsageData> {
    const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = {
      headers: { 'Authorization': `Bearer ${token.trim()}` }
    };
    if (proxyConfig) reqConfig.proxy = proxyConfig;
    const res = await http.get<unknown>(DEEPSEEK_API, reqConfig);
    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:deepseek] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = mapDeepseekBalance(res.data as Record<string, unknown>);
    console.log('[usage:deepseek] fetched data:', data);
    return data;
  }
```

文件底部纯函数区增加：

```ts
// DeepSeek /user/balance 响应映射（纯函数，便于测试）
export function mapDeepseekBalance(json: Record<string, unknown>): DeepseekUsageData {
  const infos = (json?.balance_infos as unknown[]) || [];
  const first = infos[0] as Record<string, unknown> | undefined;
  if (!first) throw new Error('no balance info');
  return {
    isAvailable: !!json.is_available,
    currency: first.currency ? String(first.currency) : null,
    totalBalance: parseFloat(String(first.total_balance)) || 0,
    grantedBalance: parseFloat(String(first.granted_balance)) || 0,
    toppedUpBalance: parseFloat(String(first.topped_up_balance)) || 0,
  };
}
```

import 类型增加 `DeepseekUsageData`、`CodexUsageData`；`getCodexAuth` 从 `./codex-credentials` import（Task 9 创建，先写好 import，Task 9 完成后 typecheck 才过——两个 Task 连续执行，中间不跑 typecheck）。

- [ ] **Step 3: SETTINGS_GET/SAVE 加 deepseek**（`src/main/main.ts`）

`SETTINGS_GET` return 增加：

```ts
    deepseek: { token: cfg.deepseek.token ? maskToken(cfg.deepseek.token) : '', enabled: cfg.deepseek.enabled, useProxy: cfg.deepseek.useProxy },
    codex:   { enabled: cfg.codex.enabled, useProxy: cfg.codex.useProxy },
    hasDeepseekToken: !!cfg.deepseek.token,
    codexAutoAvailable: codexAuthAvailable(),
```

`SETTINGS_SAVE` 增加 deepseek 分支（仿 kimi 的 tokenChanged 协议）；codex 无 token 字段，enabled/useProxy 走 `configStore.update` 默认合并即可，无需特殊分支。

`src/shared/types/ipc.ts` 的 `SettingsSavePayload` 增加：

```ts
  deepseek: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  codex?: { enabled: boolean; useProxy: boolean };
```

`SettingsPayload` 增加 `hasDeepseekToken: boolean; codexAutoAvailable: boolean;`。

- [ ] **Step 4: Settings.vue DeepSeek + Codex 区块**

script 增加：

```ts
const deepseek = reactive<ProviderState>(makeProvider());
const codexEnabled = ref<boolean>(false);
const codexUseProxy = ref<boolean>(false);
const codexAutoAvailable = ref<boolean>(false);
```

`onMounted` getSettings 后增加：

```ts
  deepseek.enabled = !!cfg.deepseek.enabled;
  deepseek.useProxy = !!cfg.deepseek.useProxy;
  deepseek.token = cfg.hasDeepseekToken ? (cfg.deepseek.token || '') : '';
  deepseek.hasToken = !!cfg.hasDeepseekToken;
  codexEnabled.value = !!cfg.codex?.enabled;
  codexUseProxy.value = !!cfg.codex?.useProxy;
  codexAutoAvailable.value = !!cfg.codexAutoAvailable;
```

`onSave` payload 增加：

```ts
      deepseek: {
        token: deepseek.token.trim(),
        tokenChanged: deepseek.tokenChanged,
        enabled: deepseek.enabled,
        useProxy: deepseek.useProxy,
      },
      codex: { enabled: codexEnabled.value, useProxy: codexUseProxy.value },
```

模板在 Copilot section 之后追加两个 section（结构完全仿 MiniMax section；DeepSeek 的 label 为 `API Key`、placeholder `粘贴 platform.deepseek.com 的 API Key`）：

```html
      <!-- DeepSeek -->
      <div class="settings-section" data-provider="deepseek">
        <div class="settings-section-header">
          <span class="settings-section-title">DeepSeek</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="deepseek.enabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="deepseek.useProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-label" for="deepseekToken">API Key</label>
          <div class="settings-input-wrap">
            <input
              :type="deepseek.showToken ? 'text' : 'password'"
              id="deepseekToken"
              class="settings-input"
              v-model="deepseek.token"
              :placeholder="deepseek.hasToken ? '留空保持原值' : '粘贴 platform.deepseek.com 的 API Key'"
              autocomplete="off"
              spellcheck="false"
              @input="deepseek.tokenChanged = true"
            >
            <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="deepseek.showToken = !deepseek.showToken">
              {{ deepseek.showToken ? '🔒' : '👁' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Codex -->
      <div class="settings-section" data-provider="codex">
        <div class="settings-section-header">
          <span class="settings-section-title">Codex</span>
          <label class="settings-toggle">
            <input type="checkbox" v-model="codexEnabled">
            <span class="settings-toggle-slider"></span>
          </label>
        </div>
        <div class="settings-field">
          <label class="settings-toggle-label">
            <input type="checkbox" v-model="codexUseProxy">
            <span>使用代理</span>
          </label>
        </div>
        <div class="settings-field">
          <div class="settings-hint" v-if="codexAutoAvailable">已检测到本机 Codex CLI 登录（~/.codex/auth.json），自动读取，无需配置。</div>
          <div class="settings-hint" v-else>未检测到本机 Codex CLI 登录。请先安装并登录 Codex CLI（~/.codex/auth.json）。</div>
        </div>
      </div>
```

- [ ] **Step 5: 验证**

Run: `npx vitest run src/main/usage-monitor.test.ts`
Expected: 新增 mapDeepseekBalance 用例 PASS（typecheck 待 Task 9 后统一跑）

---

### Task 9: Codex 本地凭证模块 + fetcher

**Files:**
- Create: `src/main/codex-credentials.ts`
- Test: `src/main/codex-credentials.test.ts`
- Modify: `src/main/usage-monitor.ts`（fetchCodex + mapWhamUsage）
- Modify: `src/main/usage-monitor.test.ts`

- [ ] **Step 1: 失败测试**（`src/main/codex-credentials.test.ts`）

```ts
import { describe, it, expect } from 'vitest';
import { parseCodexAuthFile, isCodexTokenValid } from './codex-credentials';

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256' })}.${b64(payload)}.sig`;
}

describe('parseCodexAuthFile', () => {
  it('解析 chatgpt 模式 auth.json', () => {
    const raw = JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: makeJwt({ exp: 2000 }), refresh_token: 'r', account_id: 'acc-1' },
    });
    const r = parseCodexAuthFile(raw);
    expect(r?.accountId).toBe('acc-1');
    expect(r?.refreshToken).toBe('r');
    expect(r?.accessTokenExp).toBe(2000);
  });
  it('缺 tokens 返回 null', () => {
    expect(parseCodexAuthFile('{}')).toBeNull();
    expect(parseCodexAuthFile('not json')).toBeNull();
  });
});

describe('isCodexTokenValid', () => {
  it('exp 超过 10 分钟缓冲 → 有效', () => {
    expect(isCodexTokenValid(1000 + 601, 1000)).toBe(true);
    expect(isCodexTokenValid(1000 + 600, 1000)).toBe(false);
    expect(isCodexTokenValid(null, 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: 实现** `src/main/codex-credentials.ts`

```ts
/**
 * Codex CLI 本地凭证读取与刷新
 * 凭证位于 ~/.codex/auth.json（auth_mode=chatgpt 时 tokens.access_token 为 JWT，约 6 天有效）
 * 过期时走 auth.openai.com 的 refresh_token grant 刷新并合并写回（与 CLI 自身行为一致）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import axios, { AxiosProxyConfig } from 'axios';

export interface CodexAuth {
  accessToken: string;
  accountId: string | null;
}

/** Codex CLI 的公开 OAuth client_id */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REQUEST_TIMEOUT_MS = 8000;
/** access_token 剩余有效期不足该值时提前刷新 */
const EXPIRY_BUFFER_SEC = 600;

interface CodexAuthFile {
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  accessTokenExp: number | null;
}

export function codexAuthPath(): string {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

function decodeExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** 解析 auth.json 内容（纯函数） */
export function parseCodexAuthFile(raw: string): CodexAuthFile | null {
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const tokens = json.tokens as Record<string, unknown> | undefined;
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token) return null;
    if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) return null;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accountId: typeof tokens.account_id === 'string' ? tokens.account_id : null,
      accessTokenExp: decodeExp(tokens.access_token),
    };
  } catch {
    return null;
  }
}

export function isCodexTokenValid(
  exp: number | null,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  return exp !== null && exp > nowSec + EXPIRY_BUFFER_SEC;
}

/** 本地是否存在可用的 Codex 登录（不要求 token 未过期，过期可刷新） */
export function codexAuthAvailable(): boolean {
  return readCodexAuthFile() !== null;
}

function readCodexAuthFile(): CodexAuthFile | null {
  try {
    const p = codexAuthPath();
    if (!fs.existsSync(p)) return null;
    return parseCodexAuthFile(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 刷新并合并写回 auth.json（保留 auth_mode 等其他字段；原子写） */
async function refreshCodexAuth(file: CodexAuthFile, proxyConfig: AxiosProxyConfig | null): Promise<CodexAuthFile> {
  const res = await axios.post(
    OPENAI_TOKEN_URL,
    { client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: file.refreshToken },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    }
  );
  const data = res.data as Record<string, unknown>;
  if (!data || typeof data.access_token !== 'string') {
    throw new Error(`codex refresh failed: HTTP ${res.status}`);
  }
  const p = codexAuthPath();
  const original = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  const tokens = (original.tokens as Record<string, unknown>) || {};
  tokens.access_token = data.access_token;
  if (typeof data.refresh_token === 'string') tokens.refresh_token = data.refresh_token;
  if (typeof data.id_token === 'string') tokens.id_token = data.id_token;
  original.tokens = tokens;
  original.last_refresh = new Date().toISOString();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(original, null, 2), 'utf8');
  fs.renameSync(tmp, p);
  return {
    accessToken: data.access_token,
    refreshToken: tokens.refresh_token as string,
    accountId: file.accountId,
    accessTokenExp: decodeExp(data.access_token),
  };
}

/**
 * 获取可用的 Codex 凭证：access_token 未过期直接用，过期自动刷新。
 * 无本地登录或刷新失败返回 null。
 */
export async function getCodexAuth(proxyConfig: AxiosProxyConfig | null): Promise<CodexAuth | null> {
  const file = readCodexAuthFile();
  if (!file) return null;
  if (isCodexTokenValid(file.accessTokenExp)) {
    return { accessToken: file.accessToken, accountId: file.accountId };
  }
  try {
    const next = await refreshCodexAuth(file, proxyConfig);
    console.log('[usage:codex] local credentials refreshed');
    return { accessToken: next.accessToken, accountId: next.accountId };
  } catch (e) {
    console.warn('[usage:codex] refresh local credentials failed:', (e as Error).message);
    return null;
  }
}
```

- [ ] **Step 3: 跑测试确认通过**

Run: `npx vitest run src/main/codex-credentials.test.ts`
Expected: 4 个用例 PASS

- [ ] **Step 4: fetchCodex + mapWhamUsage**（`src/main/usage-monitor.ts`）

常量：

```ts
const CODEX_USAGE_API = 'https://chatgpt.com/backend-api/wham/usage';
```

fetcher（token 参数忽略——resolveToken 只用来探测本地凭证可用性，真实凭证在 fetcher 内重新获取）：

```ts
  // ==================== Codex ====================

  // token 参数为 resolveToken 的占位标记，实际凭证从 ~/.codex/auth.json 读取（含 account_id）
  private async fetchCodex(_token: string, proxyConfig: AxiosProxyConfig | null): Promise<CodexUsageData> {
    const auth = await getCodexAuth(proxyConfig);
    if (!auth) throw new Error('local codex auth unavailable');
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${auth.accessToken}`,
      'Accept': 'application/json',
    };
    if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;
    const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = { headers };
    if (proxyConfig) reqConfig.proxy = proxyConfig;
    const res = await http.get<unknown>(CODEX_USAGE_API, reqConfig);
    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:codex] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = mapWhamUsage(res.data as Record<string, unknown>);
    console.log('[usage:codex] fetched data:', JSON.stringify(data));
    return data;
  }
```

纯函数（文件底部导出）：

```ts
// Codex wham/usage 响应映射（纯函数，便于测试）
export function mapWhamUsage(json: Record<string, unknown>): CodexUsageData {
  const rl = (json?.rate_limit as Record<string, unknown>) || {};
  const mapWindow = (w: unknown): CodexWindowData | null => {
    if (!w || typeof w !== 'object') return null;
    const o = w as Record<string, unknown>;
    return {
      usedPercent: Math.max(0, Math.min(100, Number(o.used_percent) || 0)),
      windowSeconds: Number(o.limit_window_seconds) || 0,
      resetAt: typeof o.reset_at === 'number' ? o.reset_at : null,
    };
  };
  const credits = (json?.credits as Record<string, unknown>) || {};
  return {
    planType: json.plan_type ? String(json.plan_type) : null,
    primary: mapWindow(rl.primary_window),
    secondary: mapWindow(rl.secondary_window),
    creditsBalance: credits.balance != null ? String(credits.balance) : null,
  };
}
```

测试（追加到 `src/main/usage-monitor.test.ts`）：

```ts
import { mapWhamUsage } from './usage-monitor';

describe('mapWhamUsage', () => {
  it('映射 primary/secondary 窗口', () => {
    const json = {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 42, limit_window_seconds: 18000, reset_at: 1785000000 },
        secondary_window: null,
      },
      credits: { balance: '0' },
    };
    expect(mapWhamUsage(json)).toEqual({
      planType: 'plus',
      primary: { usedPercent: 42, windowSeconds: 18000, resetAt: 1785000000 },
      secondary: null,
      creditsBalance: '0',
    });
  });
  it('缺 rate_limit 容错', () => {
    const r = mapWhamUsage({});
    expect(r.primary).toBeNull();
    expect(r.planType).toBeNull();
  });
});
```

import 处补 `CodexWindowData` 类型。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm test`
Expected: 全部通过

---

### Task 10: 渲染层接线（useUsageState / UsageCard / App / FloatingBall）

**Files:**
- Modify: `src/renderer/src/composables/useUsageState.ts`
- Modify: `src/renderer/src/components/UsageCard.vue`
- Modify: `src/renderer/src/App.vue`
- Modify: `src/renderer/src/FloatingBall.vue`

- [ ] **Step 1: useUsageState**（`src/renderer/src/composables/useUsageState.ts`）

新增 ref 与消息分支（仿 copilot）：

```ts
  const deepseek = ref<UsageProviderState | null>(null);
  const codex = ref<UsageProviderState | null>(null);
```

`handleMessage` 的 `init` 分支增加：

```ts
        if (msg.data.usage.deepseek) deepseek.value = msg.data.usage.deepseek;
        if (msg.data.usage.codex)    codex.value    = msg.data.usage.codex;
```

`usageInit` 分支增加：

```ts
      if (msg.data.deepseek) deepseek.value = msg.data.deepseek;
      if (msg.data.codex)    codex.value    = msg.data.codex;
```

`usageUpdate` 分支增加：

```ts
      if (msg.provider === 'deepseek') deepseek.value = { ...(deepseek.value || {} as UsageProviderState), ...update };
      if (msg.provider === 'codex')    codex.value    = { ...(codex.value    || {} as UsageProviderState), ...update };
```

`isProviderVisible` 的 id 联合类型改为 `'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex'`，err 取值链补两个分支：

```ts
  const isProviderVisible = (id: 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex') => {
    const err = id === 'kimi' ? kimi.value?.error
              : id === 'minimax' ? minimax.value?.error
              : id === 'deepseek' ? deepseek.value?.error
              : id === 'codex' ? codex.value?.error
              : copilot.value?.error;
    return err !== 'no_token' && err !== 'disabled';
  };
```

新增 codex slot（取 primary 窗口；无 primary 时 fallback secondary），导出增加 `deepseek`、`codex`、`codexSlot`：

```ts
  const codexSlot = computed<FiveHourSlot>(() => {
    const state = codex.value;
    const data = state?.data as CodexUsageData | undefined;
    const win = data?.primary ?? data?.secondary ?? null;
    if (!state || state.error || !win) {
      return { percent: 0, resetTime: null, resetText: '', level: 'muted' };
    }
    const percent = Math.max(0, Math.min(100, win.usedPercent ?? 0));
    const resetMs = win.resetAt ? win.resetAt * 1000 : null;
    return {
      percent,
      resetTime: resetMs,
      resetText: formatReset(resetMs, now.value),
      level: barLevel(percent, thresholds)
    };
  });
```

import 类型增加 `CodexUsageData`。

- [ ] **Step 2: App.vue**（`src/renderer/src/App.vue:23-25` 与 `118-120` 附近）

usage 对象初始化增加 `deepseek: null, codex: null`；init 赋值增加：

```ts
  usage.deepseek = payload.deepseek ?? null;
  usage.codex = payload.codex ?? null;
```

（具体字段名以 App.vue 现有写法为准，仿 copilot 行。）

- [ ] **Step 3: UsageCard**（`src/renderer/src/components/UsageCard.vue`）

script 增加（放在 Copilot 专用区后）：

```ts
// ---- DeepSeek 专用 ----
const deepseekData = computed<DeepseekUsageData | null>(() => {
  return (props.usage.deepseek?.data as DeepseekUsageData | undefined) ?? null;
});

const deepseekBalanceText = computed<string>(() => {
  const d = deepseekData.value;
  if (!d) return '—';
  const symbol = d.currency === 'CNY' ? '¥' : d.currency === 'USD' ? '$' : (d.currency ? d.currency + ' ' : '');
  return `${symbol}${d.totalBalance.toFixed(2)}`;
});

const deepseekGrantedText = computed<string>(() => {
  const d = deepseekData.value;
  if (!d || !d.grantedBalance) return '';
  return `含赠送 ${d.grantedBalance.toFixed(2)}`;
});

// ---- Codex 专用 ----
const codexData = computed<CodexUsageData | null>(() => {
  return (props.usage.codex?.data as CodexUsageData | undefined) ?? null;
});

function codexWindowLabel(seconds: number): string {
  if (seconds <= 5 * 3600 + 60) return '5h';
  if (seconds <= 24 * 3600 + 60) return 'day';
  return 'week';
}

function codexWindowPercent(w: CodexWindowData | null): number {
  if (!w) return 0;
  return Math.max(0, Math.min(100, w.usedPercent ?? 0));
}

function codexWindowText(w: CodexWindowData | null): string {
  if (!w) return '—';
  return `${codexWindowPercent(w)}%`;
}
```

`usageLastTs` 数组补 `props.usage.deepseek?.lastUpdated, props.usage.codex?.lastUpdated`。`allNoToken` 改为五个条件相与（补 deepseek/codex）。import 类型增加 `DeepseekUsageData, CodexUsageData, CodexWindowData`。

模板在 `.usage-list` 内 MiniMax row 之后追加：

```html
      <!-- DeepSeek -->
      <div class="usage-row" v-if="!isProviderDisabled('deepseek')"
        :data-disabled="String(isProviderDisabled('deepseek'))" data-provider="deepseek">
        <div class="usage-row-header">
          <span class="usage-name">DeepSeek</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('deepseek')"
              :title="usage.deepseek?.error || usageStatusText('deepseek')"></span>
          </div>
        </div>
        <div class="usage-bar-block" v-if="showUsageBars('deepseek')">
          <div class="usage-bar-label">
            <span>balance</span>
            <span class="usage-bar-value">{{ deepseekBalanceText }}</span>
          </div>
          <div class="usage-bar-meta" v-if="deepseekGrantedText">{{ deepseekGrantedText }}</div>
        </div>
      </div>

      <!-- Codex -->
      <div class="usage-row" v-if="!isProviderDisabled('codex')"
        :data-disabled="String(isProviderDisabled('codex'))" data-provider="codex">
        <div class="usage-row-header">
          <span class="usage-name">Codex<span v-if="codexData?.planType" class="usage-bar-meta"> {{ codexData.planType }}</span></span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('codex')"
              :title="usage.codex?.error || usageStatusText('codex')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('codex')">
          <div class="usage-bar-block" v-if="codexData?.primary">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>{{ codexWindowLabel(codexData.primary.windowSeconds) }}</span>
                <div class="usage-bar-meta" v-if="codexData.primary.resetAt">{{ formatResetTime(codexData.primary.resetAt * 1000) }}</div>
              </div>
              <span class="usage-bar-value">{{ codexWindowText(codexData.primary) }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: codexWindowPercent(codexData.primary) + '%' }"
                :class="barClass(codexWindowPercent(codexData.primary), usage.thresholds)"></div>
            </div>
          </div>
          <div class="usage-bar-block" v-if="codexData?.secondary" data-hide-compact>
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>{{ codexWindowLabel(codexData.secondary.windowSeconds) }}</span>
                <div class="usage-bar-meta" v-if="codexData.secondary.resetAt">{{ formatResetTime(codexData.secondary.resetAt * 1000) }}</div>
              </div>
              <span class="usage-bar-value">{{ codexWindowText(codexData.secondary) }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: codexWindowPercent(codexData.secondary) + '%' }"
                :class="barClass(codexWindowPercent(codexData.secondary), usage.thresholds)"></div>
            </div>
          </div>
        </template>
      </div>
```

注意：`formatResetTime` 的第一个参数类型若不接受 number，按 `src/renderer/src/utils/time.ts` 现有签名调整（MiniMax 处传的是相对毫秒字符串，Kimi 传 ISO 串；codex 传绝对毫秒 number，若签名不允许则 `String(codexData.primary.resetAt * 1000)`）。实施时以 typecheck 为准。

- [ ] **Step 4: FloatingBall**（`src/renderer/src/FloatingBall.vue`）

import 增加 `codexSlot`；新增：

```ts
const codexVisible = computed<boolean>(() => isProviderVisible('codex'));
```

模板 copilot row 之后仿造增加：

```html
      <div class="fb-row" v-if="codexVisible">
        <!-- label/bar/percent/reset 结构完全仿 kimi row，数据绑定 codexSlot -->
      </div>
```

（实施时复制 kimi row 的 128-138 行结构，把 `kimiFiveHour` 换成 `codexSlot`，label 文本换成 `Cod`。）

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通过，vite build 无错

---

### Task 11: 端到端手动验证

- [ ] **Step 1: 构建并启动 dev**

Run: `npm run build:main && npm run dev`
Expected: 应用启动无报错

- [ ] **Step 2: Kimi 自动凭证验证**

操作：设置中清空 Kimi token 保存 → 观察主面板 Kimi 用量是否自动出现（本机 `~/.kimi-code/credentials/kimi-code.json` 存在）。
Expected: 无 token 也能拉到 Kimi 用量；日志出现 `[usage:kimi] local credentials refreshed`（若原 token 已过期）

- [ ] **Step 3: Copilot device flow 验证**

操作：设置 Copilot 区点「连接 GitHub」→ 浏览器输入验证码授权 → 状态提示「已连接」→ 保存 → 主面板出现 Copilot 用量。
Expected: `config.json` 中 `copilot.token` 为 `gho_` 开头；日志出现 `[usage:copilot] fetched data (oauth)`

- [ ] **Step 4: Codex 自动凭证验证**

操作：设置中开启 Codex 保存 → 主面板出现 Codex 用量（本机 `~/.codex/auth.json` 已实测可用，plan_type=plus）。
Expected: 显示 primary 窗口 bar（当前为 week 窗口）；日志出现 `[usage:codex] fetched data`

- [ ] **Step 5: DeepSeek 验证**

操作：设置 DeepSeek 区粘贴 platform.deepseek.com 的 API Key 保存 → 主面板出现 DeepSeek 余额文本。
Expected: 显示 `balance ¥xx.xx`；无 API Key 时显示 `no_token` 状态且不占 UI

- [ ] **Step 6: 更新文档**

- `AGENTS.md` 的 State Model「Usage quotas」条目补充认证来源说明（Kimi 本地凭证 / Copilot OAuth / Codex 本地凭证 / DeepSeek API Key）。
- 写 `.vibe-harness/history/auto-provider-auth.md`（改动摘要 + 影响范围），并在 `.vibe-harness/index.md` 追加索引条目。

---

## Self-Review 记录

- **Spec 覆盖：** Kimi 自动读取（Task 1-2）✅；Copilot device flow（Task 3-5）✅；MiniMax 不动 ✅；旧 Cookie 后备保留 ✅；DeepSeek（Task 7、8、10）✅；Codex（Task 7、9、10）✅。
- **循环引用：** Task 4 已决策 copilot-auth 内联 `percentUsed`，不 import usage-monitor。codex-credentials 不 import usage-monitor（映射函数 mapWhamUsage 放 usage-monitor 单侧），无环。
- **类型一致性：** `CopilotDeviceStartResult` / `CopilotDeviceResult` 在 ipc.ts 定义，preload/Settings/main 均按此命名；`kimiAutoAvailable`、`copilotOAuth`、`codexAutoAvailable`、`hasDeepseekToken` 三处（ipc.ts / main.ts / Settings.vue）命名一致；`DeepseekUsageData` / `CodexUsageData` / `CodexWindowData` 在 shared/types/usage.ts 单点定义。
- **依赖顺序：** Task 8 的 usage-monitor 改动 import 了 Task 9 才创建的 `codex-credentials.ts`，两 Task 连续执行，统一在 Task 9 Step 5 跑 typecheck，中途不跑。
- **Android 影响：** 已在本计划头部声明为已知限制，不在本期修。
