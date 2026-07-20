/**
 * AI 用量监控器
 * 轮询 Kimi、MiniMax 和 Copilot 用量 API，通过 onUpdate 回调推送数据
 * 失败时不抛出，错误信息保存到 state 中由前端展示
 */

import axios, { AxiosError, AxiosProxyConfig } from 'axios';
import type { ConfigStore } from './config';
import { CopilotSessionCache, fetchCopilotUser, isCopilotOAuthToken } from './copilot-auth';
import { getCodexAuth } from './codex-credentials';
import type {
  ProviderId,
  UsageMetric,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
  DeepseekUsageData,
  CodexUsageData,
  CodexWindowData,
  UsageUpdatePayload,
  UsageSnapshot,
  ProviderUsageData,
} from '../shared/types/usage';

const KIMI_API = 'https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats';
const MINIMAX_API = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
const COPILOT_API = 'https://github.com/github-copilot/chat/entitlement';
const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';
const CODEX_USAGE_API = 'https://chatgpt.com/backend-api/wham/usage';
const REQUEST_TIMEOUT_MS = 8000;

// 浏览器风格的 UA,避免被部分 API 当作 node 客户端拒绝
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// 共享 axios 实例,统一超时与基础头
const http = axios.create({
  timeout: REQUEST_TIMEOUT_MS,
  headers: { ...BROWSER_HEADERS }, // 浅拷贝避免被 axios 内部修改污染
  // 拒绝非 2xx 时仍返回 response(便于读取 body)
  validateStatus: (status) => status >= 200 && status < 500
});

type UpdateCallback = (payload: UsageUpdatePayload) => void;

export class UsageMonitor {
  private configStore: ConfigStore;
  private callbacks: UpdateCallback[] = [];
  private interval: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private _unsubscribe: (() => void) | null = null;
  private copilotSession = new CopilotSessionCache();
  state: UsageSnapshot = {
    kimi:    { data: null, lastUpdated: null, error: null },
    minimax: { data: null, lastUpdated: null, error: null },
    copilot: { data: null, lastUpdated: null, error: null },
    deepseek: { data: null, lastUpdated: null, error: null },
    codex:   { data: null, lastUpdated: null, error: null }
  };

  constructor(configStore: ConfigStore) {
    this.configStore = configStore;
    this.intervalMs = configStore.get().intervalMinutes * 60 * 1000;

    // 订阅配置变化：interval 变化时重启轮询
    this._unsubscribe = configStore.onChange((cfg) => {
      const newMs = cfg.intervalMinutes * 60 * 1000;
      if (newMs !== this.intervalMs && this.interval) {
        this.intervalMs = newMs;
        this.restart();
      }
    });
  }

  // 注册更新回调
  onUpdate(cb: UpdateCallback): void {
    this.callbacks.push(cb);
  }

  // 启动轮询
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.checkAll(), this.intervalMs);
    this.checkAll(); // 立即执行一次
  }

  // 停止轮询
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this._unsubscribe) this._unsubscribe();
  }

  // 重启（interval 变更时用）
  restart(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.start();
  }

  // 主入口：依次检查所有 provider
  async checkAll(): Promise<void> {
    await Promise.all([
      this._safeRun('kimi',    this.fetchKimi.bind(this)),
      this._safeRun('minimax', this.fetchMiniMax.bind(this)),
      this._safeRun('copilot', this.fetchCopilot.bind(this)),
      this._safeRun('deepseek', this.fetchDeepseek.bind(this)),
      this._safeRun('codex',   this.fetchCodex.bind(this),
        async (proxy) => (await getCodexAuth(proxy)) ? 'local' : null)
    ]);
  }

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

    // 手动 token 优先；为空时尝试自动来源（如 Codex 本地 CLI 凭证）
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

  private _emit(provider: ProviderId): void {
    const payload: UsageUpdatePayload = {
      provider,
      data: this.state[provider].data,
      lastUpdated: this.state[provider].lastUpdated,
      error: this.state[provider].error
    };
    this.callbacks.forEach(cb => {
      try { cb(payload); } catch (e) {
        console.error('[usage] onUpdate callback error:', e);
      }
    });
  }

  // ==================== Kimi ====================

  private async fetchKimi(token: string, proxyConfig: AxiosProxyConfig | null): Promise<KimiUsageData> {
    let res;
    try {
      const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
        }
      };
      if (proxyConfig) reqConfig.proxy = proxyConfig;
      res = await http.post<unknown>(KIMI_API, {}, reqConfig);
    } catch (e) {
      throw e; // 网络层/超时
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:kimi] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data as Record<string, unknown>;
    if (!json || typeof json !== 'object') {
      throw new Error('invalid response');
    }

    const data = mapKimiSubscriptionStats(json);
    console.log('[usage:kimi] fetched data:', JSON.stringify(data));
    return data;
  }

  // ==================== MiniMax ====================

  private async fetchMiniMax(token: string, proxyConfig: AxiosProxyConfig | null): Promise<MinimaxUsageData> {
    let res;
    try {
      const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = {
        headers: {
          'Authorization': `Bearer ${token.trim()}`
        }
      };
      if (proxyConfig) reqConfig.proxy = proxyConfig;
      res = await http.get<unknown>(MINIMAX_API, reqConfig);
    } catch (e) {
      throw e;
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:minimax] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data as Record<string, unknown>;
    if (!json || (json.base_resp as Record<string, unknown>)?.status_code !== 0) {
      console.error('[usage:minimax] api error response:', JSON.stringify(json).slice(0, 500));
      throw new Error((json?.base_resp as Record<string, unknown>)?.status_msg as string || 'api error');
    }

    // 只取 model_name === 'general' 那条
    const arr = (json.model_remains as unknown[]) || [];
    const general = (arr as Array<Record<string, unknown>>).find(m => m.model_name === 'general');
    if (!general) {
      throw new Error('general model not found');
    }
    console.log('[usage:minimax] general model found:', JSON.stringify({
      fiveHourPercent: Number(general.current_interval_remaining_percent) || 0,
      weeklyPercent: Number(general.current_weekly_remaining_percent) || 0,
      fiveHourResetTime: general.remains_time || null,
      weeklyResetTime: general.weekly_remains_time || null
    }));
    return {
      fiveHourPercent: Number(general.current_interval_remaining_percent) || 0,
      weeklyPercent: Number(general.current_weekly_remaining_percent) || 0,
      fiveHourResetTime: general.remains_time ? String(general.remains_time) : null,
      weeklyResetTime: general.weekly_remains_time ? String(general.weekly_remains_time) : null
    };
  }

  // ==================== Copilot ====================

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

  // 旧路径：token 字段存的是从浏览器复制的整段 Cookie 串
  private async fetchCopilotByCookie(cookie: string, proxyConfig: AxiosProxyConfig | null): Promise<CopilotUsageData> {
    let res;
    try {
      const reqConfig: { headers: Record<string, string>; proxy?: AxiosProxyConfig } = {
        headers: {
          'Cookie': cookie.trim(),
          'Referer': 'https://github.com/copilot',
          'Accept': 'application/json, text/plain, */*'
        }
      };
      if (proxyConfig) reqConfig.proxy = proxyConfig;
      res = await http.get<unknown>(COPILOT_API, reqConfig);
    } catch (e) {
      throw e;
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:copilot] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data as Record<string, unknown>;
    if (!json || typeof json !== 'object' || !json.quotas) {
      throw new Error('invalid response, cookie may be incorrect or expired');
    }

    const quotas = json.quotas as Record<string, unknown>;
    const limits    = (quotas.limits    as Record<string, unknown>) || {};
    const remaining = (quotas.remaining as Record<string, unknown>) || {};

    const result: CopilotUsageData = {
      premium: {
        limit:        Number(limits.premiumInteractions)    || 0,
        remaining:    Number(remaining.premiumInteractions) || 0,
        percent:      calcPercent(
                        (Number(limits.premiumInteractions) || 0) - (Number(remaining.premiumInteractions) || 0),
                        Number(limits.premiumInteractions)
                      ),
        resetDate:    quotas.resetDate    ? String(quotas.resetDate) : null,
        resetDateUtc: quotas.resetDateUtc ? String(quotas.resetDateUtc) : null
      },
      chat: { percent: Number(remaining.chatPercentage) || 0 },
      plan: json.plan ? String(json.plan) : null,
      licenseType: json.licenseType ? String(json.licenseType) : null
    };

    console.log('[usage:copilot] fetched data:', result);
    return result;
  }

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

  // 对外提供快照(用于 init 推送)
  snapshot(): UsageSnapshot {
    return JSON.parse(JSON.stringify(this.state)) as UsageSnapshot;
  }
}

// ==================== 可测试的纯函数 ====================

export function calcPercent(used: number | string, limit: number | string): number {
  const u = Number(used) || 0;
  const l = Number(limit) || 0;
  if (l <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((u / l) * 100)));
}

// Kimi GetSubscriptionStats 响应映射（纯函数，便于测试）
// 新接口只给 0-1 的已用比例，没有绝对配额数字；映射为 limit=100 的百分比语义（保留两位小数）
export function mapKimiSubscriptionStats(json: Record<string, unknown>): KimiUsageData {
  const ratioToMetric = (ratio: unknown, resetTime: unknown): UsageMetric => {
    const pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 10000) / 100));
    return {
      limit: 100,
      used: pct,
      remaining: Math.round((100 - pct) * 100) / 100,
      percent: pct,
      resetTime: resetTime ? String(resetTime) : null
    };
  };
  const r5h = (json.ratelimitCode5h as Record<string, unknown>) || {};
  const r7d = (json.ratelimitCode7d as Record<string, unknown>) || {};
  const sub = (json.subscriptionBalance as Record<string, unknown>) || {};
  return {
    total:         ratioToMetric(sub.amountUsedRatio, sub.expireTime),
    codingWeekly:  ratioToMetric(r7d.ratio, r7d.resetTime),
    codingFiveHour: ratioToMetric(r5h.ratio, r5h.resetTime)
  };
}

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

// 解析代理 URL 为 axios 的 proxy 配置格式
export function parseProxyUrl(urlStr: string): AxiosProxyConfig | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const url = new URL(urlStr.trim());
    const result: AxiosProxyConfig = {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80),
    };
    if (url.username) {
      result.auth = { username: url.username, password: url.password };
    }
    return result;
  } catch {
    return null;
  }
}

// 把 axios 错误格式化成简短字符串
export function formatAxiosError(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: string }).code;
    if (code === 'ECONNABORTED') return 'timeout';
    if (code === 'ENOTFOUND') return 'DNS 解析失败';
    if (code === 'ECONNREFUSED') return '连接被拒绝';
  }
  if (e && typeof e === 'object' && 'response' in e) {
    const err = e as AxiosError;
    const body = typeof err.response?.data === 'string'
      ? err.response.data
      : JSON.stringify(err.response?.data || {});
    return `HTTP ${err.response?.status}: ${body.slice(0, 200)}`;
  }
  return (e as Error)?.message || String(e);
}
