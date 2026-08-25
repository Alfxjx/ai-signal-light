# Electron：火山引擎 Ark Coding Plan 用量监控 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 桌面端新增 `volcengine` 用量 provider，用户设置里粘贴 Cookie + x-csrf-token，轮询 `GetCodingPlanUsage` 并展示 session/weekly/monthly 三档用量，同时纳入桌面→手机 WS 同步契约。

**Architecture:** 复用现有 kimi/minimax/copilot/deepseek/codex 的 provider 模式。新增专用配置类型 `VolcengineProviderConfig`（cookie/csrfToken/enabled/useProxy，因为单 `token` 字段装不下两个凭证）；`usage-monitor.ts` 新增 `fetchVolcengine` + 纯函数 `mapVolcengineUsage`；渲染层 Settings.vue 新增分区、UsageCard 新增三档卡片；`pairing.toMobileConfig` 把 `volcengine` 投影进 `MobileAppConfig`。

**Tech Stack:** TypeScript、axios、vue 3、electron IPC、vitest。

参考规格：`docs/superpowers/specs/2026-08-25-volcengine-coding-plan-usage-design.md`

---

### Task 1: 共享类型 —— 新增 volcengine provider 与配置类型

**Files:**
- Modify: `src/shared/types/usage.ts`
- Modify: `src/shared/types/config.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/renderer/src/types/messages.ts`

- [ ] **Step 1: 更新 usage 类型，加入 volcengine**

  `src/shared/types/usage.ts`：

  ```ts
  export type ProviderId = 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex' | 'volcengine';
  ```

  在 `CodexUsageData` 之后新增：

  ```ts
  export interface VolcengineUsageData {
    session:  UsageMetric;  // 会话周期
    weekly:   UsageMetric;  // 周周期
    monthly:  UsageMetric;  // 月周期
  }
  ```

  把 `ProviderUsageData` 联合类型和 `UsageSnapshot`/`UsageUpdatePayload` 的 `ProviderId` 使用无需改动（它们是 keyed 结构）。仅把 `ProviderUsageData` 联合类型加入 `VolcengineUsageData`：

  ```ts
  export type ProviderUsageData = KimiUsageData | MinimaxUsageData | CopilotUsageData | DeepseekUsageData | CodexUsageData | VolcengineUsageData;
  ```

- [ ] **Step 2: 更新 config 类型**

  `src/shared/types/config.ts`，在 `ProviderConfig` 后新增：

  ```ts
  export interface VolcengineProviderConfig {
    cookie: string;
    csrfToken: string;
    enabled: boolean;
    useProxy: boolean;
  }
  ```

  `AppConfig` 加入字段：
  ```ts
  volcengine: VolcengineProviderConfig;
  ```
  `MobileAppConfig` 加入字段：
  ```ts
  volcengine: VolcengineProviderConfig;
  ```

  `ConfigPartial` 的 Omit 列表加入 `'volcengine'`，并新增：
  ```ts
  volcengine?: Partial<VolcengineProviderConfig>;
  ```

- [ ] **Step 3: 更新 ipc 类型**

  `src/shared/types/ipc.ts`：
  - `SettingsPayload` 加入 `hasVolcengineCookie: boolean;` 与 `hasVolcengineCsrfToken: boolean;`
  - `SettingsSavePayload` 加入：
    ```ts
    volcengine?: {
      cookie: string; cookieChanged: boolean;
      csrfToken: string; csrfTokenChanged: boolean;
      enabled: boolean; useProxy: boolean;
    };
    ```

- [ ] **Step 4: 更新 renderer messages 再导出**

  `src/renderer/src/types/messages.ts`：
  - 在 `CodexUsageData` 相关 `export type { ... }` 块中加入 `VolcengineUsageData`。
  - `UsageState` 与 `UsageInitPayload` 各加入一行 `volcengine: import('../../../shared/types/usage').UsageProviderState | null;`

- [ ] **Step 5: 类型检查**

  Run: `npm run typecheck`
  Expected: 通过（此时代码尚未使用新字段，只加类型应无报错；如有未使用告警不影响）。

---

### Task 2: 主进程 ConfigStore —— volcengine 配置读写

**Files:**
- Modify: `src/main/config.ts`

- [ ] **Step 1: DEFAULTS 加入 volcengine**

  `src/main/config.ts` 顶部 `DEFAULTS` 对象加入一行（与 codex 平级）：
  ```ts
  volcengine: { cookie: '', csrfToken: '', enabled: true, useProxy: false },
  ```

- [ ] **Step 2: _load 合并 volcengine**

  在 `_load()` 返回对象里（`codex` 之后）加入：
  ```ts
  volcengine: { ...DEFAULTS.volcengine, ...(parsed.volcengine || {}) },
  ```

- [ ] **Step 3: update 支持 volcengine**

  在 `update()` 里加一段（放在 codex 分支之后、proxy 分支之前）：
  ```ts
  if (partial.volcengine && typeof partial.volcengine === 'object') {
    this.data.volcengine = { ...this.data.volcengine, ...partial.volcengine };
  }
  ```

- [ ] **Step 4: 添加 ConfigStore 测试（可选但推荐）**

  参考现有测试不存在 config 单测，手动验证即可：`npm start` 后保存一次设置，确认 `userData/config.json` 含 `volcengine` 字段且不丢旧字段。

---

### Task 3: usage-monitor —— fetch + 映射纯函数 + 单测

**Files:**
- Modify: `src/main/usage-monitor.ts`
- Test: `src/main/usage-monitor.test.ts`

- [ ] **Step 1: 新增常量与类型导入**

  `src/main/usage-monitor.ts`：
  ```ts
  const VOLCENGINE_API = 'https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage';
  ```
  import 里加入 `VolcengineUsageData`。

- [ ] **Step 2: state 初始化加入 volcengine**

  `UsageMonitor` 构造里 `state` 对象加入一行：
  ```ts
  volcengine: { data: null, lastUpdated: null, error: null },
  ```

- [ ] **Step 3: checkAll 加入 volcengine**

  在 `checkAll()` 的 `Promise.all` 里加入：
  ```ts
  this._safeRun('volcengine', this.fetchVolcengine.bind(this)),
  ```

- [ ] **Step 4: 实现 mapVolcengineUsage 纯函数**

  在文件底部 `calcPercent` 附近新增（可测、可复用）：

  ```ts
  export function mapVolcengineUsage(json: Record<string, unknown>): VolcengineUsageData {
    const quota = (json?.Result?.QuotaUsage as unknown[]) || [];
    const toMetric = (level: string): UsageMetric => {
      const item = quota.find(
        (q) => (q as Record<string, unknown>)?.Level === level
      ) as Record<string, unknown> | undefined;
      const percent = Number(item?.Percent) || 0;
      const limit = Number(item?.Cap) || 0;
      const resetSec = Number(item?.ResetTimestamp);
      return {
        limit,
        used: 0,                 // 接口只给百分比与额度上限，没有 used 量
        remaining: 0,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        resetTime: Number.isFinite(resetSec) && resetSec > 0
          ? new Date(resetSec * 1000).toISOString()   // 秒 → ISO 绝对时间
          : null,
      };
    };
    return {
      session: toMetric('session'),
      weekly:  toMetric('weekly'),
      monthly: toMetric('monthly'),
    };
  }
  ```

- [ ] **Step 5: 实现 fetchVolcengine**

  在 `fetchCodex` 之后新增：

  ```ts
  // token 参数为占位（_safeRun 的签名），实际凭证从配置 store 读取
  private async fetchVolcengine(_token: string, proxyConfig: AxiosProxyConfig | null): Promise<VolcengineUsageData> {
    const cfg = this.configStore.get().volcengine;
    if (!cfg.cookie || !cfg.csrfToken) throw new Error('no_token');
    const headers: Record<string, string> = {
      'Cookie': cfg.cookie.trim(),
      'x-csrf-token': cfg.csrfToken.trim(),
      'Content-Type': 'application/json',
      'Origin': 'https://console.volcengine.com',
      'Referer': 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
    };
    const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = { headers };
    if (proxyConfig) reqConfig.proxy = proxyConfig;
    const res = await http.post<unknown>(VOLCENGINE_API, undefined, reqConfig);

    let isAuthError = res.status === 401 || res.status === 403;
    const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
    if (res.status >= 400) {
      const hasAuthError = typeof res.data === 'object'
        && !!((res.data as Record<string, unknown>)?.ResponseMetadata as Record<string, unknown> | undefined)?.Error;
      if (isAuthError || hasAuthError) {
        throw new Error('登录态已过期，请更新 Cookie / x-csrf-token');
      }
      console.error(`[usage:volcengine] HTTP ${res.status}\n  body: ${bodyText.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
    }

    const json = res.data as Record<string, unknown>;
    if (!json || typeof json !== 'object' || !(json.Result as { QuotaUsage?: unknown })?.QuotaUsage) {
      throw new Error('invalid response');
    }
    const data = mapVolcengineUsage(json);
    console.log('[usage:volcengine] fetched data:', JSON.stringify(data));
    return data;
  }
  ```

- [ ] **Step 6: 写映射单测**

  在 `src/main/usage-monitor.test.ts` 顶部 import 加入 `mapVolcengineUsage`，新增 describe：

  ```ts
  describe('mapVolcengineUsage', () => {
    const real = {
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 6.0932815, ResetTimestamp: 1787639742, Cap: 100, RewardTotalPercent: 0 },
          { Level: 'weekly', Period: '1d', Percent: 0.8124375333333332, ResetTimestamp: 1788105600, Cap: 100, RewardTotalPercent: 0 },
          { Level: 'monthly', Period: '1d', Percent: 0.4062187666666666, ResetTimestamp: 1790351999, Cap: 100, RewardTotalPercent: 0 },
        ],
      },
    } as unknown as Record<string, unknown>;
    it('解析三档定额', () => {
      const r = mapVolcengineUsage(real);
      expect(r.session.percent).toBe(6);
      expect(r.weekly.percent).toBe(1);
      expect(r.monthly.percent).toBe(0);
      expect(r.session.limit).toBe(100);
      expect(r.session.resetTime).toMatch(/^2026-/);
    });
    it('缺少 QuotaUsage 时容错为 0', () => {
      const r = mapVolcengineUsage({});
      expect(r.session.percent).toBe(0);
      expect(r.monthly.resetTime).toBeNull();
    });
  });
  ```

- [ ] **Step 7: 运行单测**

  Run: `npm test -- src/main/usage-monitor.test.ts`
  Expected: 通过（含新增 2 个用例）。

---

### Task 4: 主进程 IPC —— getSettings/saveSettings 接入 volcengine

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: SETTINGS_GET 返回 volcengine 脱敏字段**

  在 `ipcMain.handle(SETTINGS_GET, ...)` 返回对象里（codex 后）加入：
  ```ts
  volcengine: {
    cookie: cfg.volcengine.cookie ? maskToken(cfg.volcengine.cookie) : '',
    csrfToken: cfg.volcengine.csrfToken ? maskToken(cfg.volcengine.csrfToken) : '',
    enabled: cfg.volcengine.enabled,
    useProxy: cfg.volcengine.useProxy,
  },
  hasVolcengineCookie: !!cfg.volcengine.cookie,
  hasVolcengineCsrfToken: !!cfg.volcengine.csrfToken,
  ```

- [ ] **Step 2: SETTINGS_SAVE 处理 volcengine 变更协议**

  在 `ipcMain.handle(SETTINGS_SAVE, ...)` 里、deepseek 分支之后加入：

  ```ts
  if (next.volcengine && typeof next.volcengine === 'object') {
    const v = next.volcengine as Record<string, unknown>;
    if (v.cookieChanged) { v.cookie = (v.cookie as string) || ''; }
    else { v.cookie = current.volcengine.cookie; }
    if (v.csrfTokenChanged) { v.csrfToken = (v.csrfToken as string) || ''; }
    else { v.csrfToken = current.volcengine.csrfToken; }
    delete (next.volcengine as Record<string, unknown>).cookieChanged;
    delete (next.volcengine as Record<string, unknown>).csrfTokenChanged;
  }
  ```

  （`configStore.update` 与 `usageMonitor.checkAll()` 已在末尾统一调用，无需再加。）

- [ ] **Step 3: 类型检查**

  Run: `npm run typecheck`
  Expected: 通过。

---

### Task 5: 渲染层 Settings.vue —— 新增火山引擎分区

**Files:**
- Modify: `src/renderer/src/Settings.vue`

- [ ] **Step 1: 新增 reactive 状态**

  在 `codexAutoAvailable` 定义之后加入：
  ```ts
  const volcengineCookie = ref<string>('');
  const volcengineCsrfToken = ref<string>('');
  const volcengineEnabled = ref<boolean>(false);
  const volcengineUseProxy = ref<boolean>(false);
  const volcengineCookieChanged = ref<boolean>(false);
  const volcengineCsrfTokenChanged = ref<boolean>(false);
  const volcengineHasCookie = ref<boolean>(false);
  const volcengineHasCsrf = ref<boolean>(false);
  const volcengineShowCookie = ref<boolean>(false);
  const volcengineShowCsrf = ref<boolean>(false);
  ```

- [ ] **Step 2: onMounted 回填**

  在 `onMounted` 里（`codexAutoAvailable` 赋值之后）加入：
  ```ts
  volcengineEnabled.value = !!cfg.volcengine?.enabled;
  volcengineUseProxy.value = !!cfg.volcengine?.useProxy;
  volcengineCookie.value = cfg.hasVolcengineCookie ? (cfg.volcengine?.cookie || '') : '';
  volcengineCsrfToken.value = cfg.hasVolcengineCsrfToken ? (cfg.volcengine?.csrfToken || '') : '';
  volcengineCookieChanged.value = false;
  volcengineCsrfTokenChanged.value = false;
  volcengineHasCookie.value = !!cfg.hasVolcengineCookie;
  volcengineHasCsrf.value = !!cfg.hasVolcengineCsrfToken;
  ```

- [ ] **Step 3: onSave 携带 volcengine**

  在 payload 对象里（`lanMode` 之前）加入：
  ```ts
  volcengine: {
    cookie: volcengineCookie.value.trim(),
    cookieChanged: volcengineCookieChanged.value,
    csrfToken: volcengineCsrfToken.value.trim(),
    csrfTokenChanged: volcengineCsrfTokenChanged.value,
    enabled: volcengineEnabled.value,
    useProxy: volcengineUseProxy.value,
  },
  ```

- [ ] **Step 4: 模板新增分区（放在 Codex 分区之后、刷新周期之前）**

  ```html
  <!-- 火山引擎 Ark Coding Plan -->
  <div class="settings-section" data-provider="volcengine">
    <div class="settings-section-header">
      <span class="settings-section-title">火山引擎 (Ark Coding Plan)</span>
      <label class="settings-toggle">
        <input type="checkbox" v-model="volcengineEnabled">
        <span class="settings-toggle-slider"></span>
      </label>
    </div>
    <div class="settings-field">
      <label class="settings-toggle-label">
        <input type="checkbox" v-model="volcengineUseProxy">
        <span>使用代理</span>
      </label>
    </div>
    <div class="settings-field">
      <label class="settings-label" for="volcengineCookie">Cookie</label>
      <div class="settings-input-wrap">
        <input
          :type="volcengineShowCookie ? 'text' : 'password'"
          id="volcengineCookie"
          class="settings-input"
          v-model="volcengineCookie"
          :placeholder="volcengineHasCookie ? '留空保持原值' : '粘贴 f12 → Network → cookie'"
          autocomplete="off" spellcheck="false"
          @input="volcengineCookieChanged = true"
        >
        <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="volcengineShowCookie = !volcengineShowCookie">
          {{ volcengineShowCookie ? '🔒' : '👁' }}
        </button>
      </div>
    </div>
    <div class="settings-field">
      <label class="settings-label" for="volcengineCsrf">x-csrf-token</label>
      <div class="settings-input-wrap">
        <input
          :type="volcengineShowCsrf ? 'text' : 'password'"
          id="volcengineCsrf"
          class="settings-input"
          v-model="volcengineCsrfToken"
          :placeholder="volcengineHasCsrf ? '留空保持原值' : '粘贴请求头 x-csrf-token'"
          autocomplete="off" spellcheck="false"
          @input="volcengineCsrfTokenChanged = true"
        >
        <button type="button" class="btn-toggle-visibility" title="显示/隐藏" @click="volcengineShowCsrf = !volcengineShowCsrf">
          {{ volcengineShowCsrf ? '🔒' : '👁' }}
        </button>
      </div>
      <div class="settings-hint">
        在 <code>console.volcengine.com/ark/.../subscription/coding-plan</code> 打开 DevTools，复制 <code>GetCodingPlanUsage</code> 请求的整段 Cookie 与 x-csrf-token。登录过期后需重新粘贴。
      </div>
    </div>
  </div>
  ```

- [ ] **Step 5: 类型检查**

  Run: `npm run typecheck`
  Expected: 通过。

---

### Task 6: 渲染层 UsageCard —— 三档用量卡片

**Files:**
- Modify: `src/renderer/src/components/UsageCard.vue`

- [ ] **Step 1: 脚本：volcengine 专用派生**

  在 `codexWindowText` 之后加入：

  ```ts
  // ---- Volcengine 专用 ----
  const volcengineData = computed<VolcengineUsageData | null>(() => {
    return (props.usage.volcengine?.data as VolcengineUsageData | undefined) ?? null;
  });
  function volcengineMetric(key: keyof VolcengineUsageData): UsageMetric | null {
    const d = volcengineData.value;
    return (d?.[key] as UsageMetric | undefined) ?? null;
  }
  function volcenginePercent(key: keyof VolcengineUsageData): number {
    const m = volcengineMetric(key);
    if (!m || !m.limit) return 0;
    return Math.max(0, Math.min(100, m.percent ?? 0));
  }
  function volcengineText(key: keyof VolcengineUsageData): string {
    const m = volcengineMetric(key);
    if (!m || !m.limit) return '—';
    return `${m.percent}%`;
  }
  ```
  在 `import type { ... }` 块中加入 `VolcengineUsageData`。

  `usageLastTs` 数组与 `allNoToken` 各加入 volcengine 项：
  ```ts
  props.usage.volcengine?.lastUpdated,   // usageLastTs 数组
  props.usage.volcengine?.error === 'no_token',  // allNoToken
  ```

- [ ] **Step 2: 模板：新增火山引擎卡片（放在 Codex 卡片之后）**

  ```html
  <!-- Volcengine -->
  <div class="usage-row" v-if="!isProviderDisabled('volcengine')"
    :data-disabled="String(isProviderDisabled('volcengine'))" data-provider="volcengine">
    <div class="usage-row-header">
      <span class="usage-name">Ark Coding Plan</span>
      <div class="usage-status-wrapper">
        <span class="usage-status" :class="usageStatusClass('volcengine')"
          :title="usage.volcengine?.error || usageStatusText('volcengine')"></span>
      </div>
    </div>
    <template v-if="showUsageBars('volcengine')">
      <div class="usage-bar-block">
        <div class="usage-bar-label">
          <div class="usage-time">
            <span>session</span>
            <div class="usage-bar-meta">{{ formatResetTime(volcengineMetric('session')?.resetTime) }}</div>
          </div>
          <span class="usage-bar-value">{{ volcengineText('session') }}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :style="{ width: volcenginePercent('session') + '%' }"
            :class="barClass(volcenginePercent('session'), usage.thresholds)"></div>
        </div>
      </div>
      <div class="usage-bar-block">
        <div class="usage-bar-label">
          <div class="usage-time">
            <span>weekly</span>
            <div class="usage-bar-meta">{{ formatResetTime(volcengineMetric('weekly')?.resetTime) }}</div>
          </div>
          <span class="usage-bar-value">{{ volcengineText('weekly') }}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :style="{ width: volcenginePercent('weekly') + '%' }"
            :class="barClass(volcenginePercent('weekly'), usage.thresholds)"></div>
        </div>
      </div>
      <div class="usage-bar-block">
        <div class="usage-bar-label">
          <div class="usage-time">
            <span>monthly</span>
            <div class="usage-bar-meta">{{ formatResetTime(volcengineMetric('monthly')?.resetTime) }}</div>
          </div>
          <span class="usage-bar-value">{{ volcengineText('monthly') }}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :style="{ width: volcenginePercent('monthly') + '%' }"
            :class="barClass(volcenginePercent('monthly'), usage.thresholds)"></div>
        </div>
      </div>
    </template>
  </div>
  ```

- [ ] **Step 3: 类型检查 + 构建**

  Run: `npm run typecheck` && `npm run build:main`
  Expected: 都通过。

---

### Task 7: pairing / MobileAppConfig 投影 → 纳入 WS 同步

**Files:**
- Modify: `src/main/pairing.ts`

- [ ] **Step 1: toMobileConfig 加入 volcengine**

  ```ts
  return {
    kimi: { ...config.kimi },
    minimax: { ...config.minimax },
    copilot: { ...config.copilot },
    volcengine: { ...config.volcengine },
    proxy: { ...config.proxy },
    intervalMinutes: config.intervalMinutes,
    thresholds: { ...config.thresholds }
  };
  ```

- [ ] **Step 2: 类型检查**

  Run: `npm run typecheck`
  Expected: 通过。

---

### Task 8: 端到端手动验证

- [ ] **Step 1: 构建并启动**

  Run: `npm run build:main` 然后 `npm run dev`
  Expected: 应用启动，托盘菜单「设置」打开设置窗口。

- [ ] **Step 2: 在设置里粘贴真实凭证**

  用 WebBridge / 浏览器 DevTools 复制 `GetCodingPlanUsage` 请求的整段 Cookie 与 `x-csrf-token`，粘贴到火山引擎分区，保存。

- [ ] **Step 3: 验证用量卡片**

  Expected: 主面板 Usage 卡片出现「Ark Coding Plan」三档进度条（session/weekly/monthly），数值与浏览器页面一致；状态点绿色。

- [ ] **Step 4: 验证错误提示**

  故意清空 Cookie 或填入错值，Expected: 状态点红，hover 显示「登录态已过期，请更新 Cookie / x-csrf-token」。

- [ ] **Step 5: 提交**

  ```bash
  git add src/ && git commit -m "feat: Electron 端新增火山引擎 Coding Plan 用量监控"
  ```

---

## 自审记录（已执行）

- 规格覆盖：数据模型、配置类型、IPC、轮询、映射单测、Settings 分区、UsageCard、MobileAppConfig 同步，均落到上图任务。
- header 名按用户实测定稿为 `x-csrf-token`（Task 3 Step 5）。
- `resetTime` 统一转 ISO 字符串，规避渲染层「相对/绝对 ms」启发式误判（Task 3 Step 4 注释已说明）。
- 类型一致性：`VolcengineProviderConfig` 字段名 `cookie/csrfToken/enabled/useProxy` 在 Electron、共享类型、Android 契约中保持一致（Android 计划同字段）。