/**
 * AI 用量监控器
 * 轮询 Kimi、MiniMax 和 Copilot 用量 API，通过 onUpdate 回调推送数据
 * 失败时不抛出，错误信息保存到 state 中由前端展示
 */

import axios, { AxiosError, AxiosProxyConfig } from 'axios';
import type { ConfigStore } from './config';
import type {
  ProviderId,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
  UsageUpdatePayload,
  UsageSnapshot,
  ProviderUsageData,
} from '../shared/types/usage';

const KIMI_API = 'https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages';
const MINIMAX_API = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';
const COPILOT_API = 'https://github.com/github-copilot/chat/entitlement';
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
  state: UsageSnapshot = {
    kimi:    { data: null, lastUpdated: null, error: null },
    minimax: { data: null, lastUpdated: null, error: null },
    copilot: { data: null, lastUpdated: null, error: null }
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
      this._safeRun('copilot', this.fetchCopilot.bind(this))
    ]);
  }

  private async _safeRun(provider: ProviderId, fetcher: (token: string, proxy: AxiosProxyConfig | null) => Promise<ProviderUsageData>): Promise<void> {
    const cfg = this.configStore.get()[provider];
    if (!cfg.enabled) {
      this.state[provider] = {
        ...this.state[provider],
        error: 'disabled'
      };
      this._emit(provider);
      return;
    }
    if (!cfg.token) {
      this.state[provider] = {
        ...this.state[provider],
        error: 'no_token'
      };
      this._emit(provider);
      return;
    }

    try {
      const globalProxy = this.configStore.get().proxy?.url;
      const proxyConfig = cfg.useProxy && globalProxy ? parseProxyUrl(globalProxy) : null;
      const data = await fetcher(cfg.token, proxyConfig);
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
        }
      };
      if (proxyConfig) reqConfig.proxy = proxyConfig;
      res = await http.post<unknown>(KIMI_API, { scope: ['FEATURE_CODING'] }, reqConfig);
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

    // 解析 totalQuota
    const total = (json.totalQuota as Record<string, unknown>) || {};
    const totalData = {
      limit: Number(total.limit) || 0,
      used: Number(total.used) || 0,
      remaining: Number(total.remaining) || 0,
      percent: calcPercent(Number(total.used), Number(total.limit))
    };

    // 解析 FEATURE_CODING usages 数组
    const usages = (json.usages as unknown[]) || [];
    const usage = (usages[0] as Record<string, unknown>) || {};

    // usages[0].detail        → 总/日配额 (resetTime 跨天)
    // usages[0].limits[0]     → 5h 窗口 (duration=300min)
    const dTotal = (usage.detail as Record<string, unknown>) || {};
    const d5h = ((usage.limits as unknown[])?.[0] as Record<string, unknown>)?.detail as Record<string, unknown> || {};

    const codingWeekly = {
      limit:     Number(dTotal.limit)     || 0,
      used:      Number(dTotal.used)      || 0,
      remaining: Number(dTotal.remaining) || 0,
      percent:   calcPercent(Number(dTotal.used), Number(dTotal.limit)),
      resetTime: dTotal.resetTime ? String(dTotal.resetTime) : null
    };

    const codingFiveHour = {
      limit:     Number(d5h.limit)     || 0,
      used:      Number(d5h.used)      || 0,
      remaining: Number(d5h.remaining) || 0,
      percent:   calcPercent(Number(d5h.used), Number(d5h.limit)),
      resetTime: d5h.resetTime ? String(d5h.resetTime) : null
    };

    console.log('[usage:kimi] fetched data:', JSON.stringify({ total: totalData, codingFiveHour, codingWeekly }));

    return { total: totalData, codingFiveHour, codingWeekly };
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

  // token 字段实际存的是从浏览器复制的整段 Cookie 串
  private async fetchCopilot(cookie: string, proxyConfig: AxiosProxyConfig | null): Promise<CopilotUsageData> {
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
