/**
 * AI 用量监控器
 * 轮询 Kimi 和 MiniMax 用量 API，通过 onUpdate 回调推送数据
 * 失败时不抛出，错误信息保存到 state 中由前端展示
 */

const axios = require('axios');

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

class UsageMonitor {
  constructor(configStore) {
    this.configStore = configStore;
    this.callbacks = [];
    this.interval = null;
    this.intervalMs = configStore.get().intervalMinutes * 60 * 1000;
    this.state = {
      kimi:    { data: null, lastUpdated: null, error: null },
      minimax: { data: null, lastUpdated: null, error: null },
      copilot: { data: null, lastUpdated: null, error: null }
    };

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
  onUpdate(cb) {
    this.callbacks.push(cb);
  }

  // 启动轮询
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => this.checkAll(), this.intervalMs);
    this.checkAll(); // 立即执行一次
  }

  // 停止轮询
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this._unsubscribe) this._unsubscribe();
  }

  // 重启（interval 变更时用）
  restart() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.start();
  }

  // 主入口：依次检查所有 provider
  async checkAll() {
    await Promise.all([
      this._safeRun('kimi',    (token) => this.fetchKimi(token)),
      this._safeRun('minimax', (token) => this.fetchMiniMax(token)),
      this._safeRun('copilot', (token) => this.fetchCopilot(token))
    ]);
  }

  async _safeRun(provider, fetcher) {
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
      const data = await fetcher(cfg.token);
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

  _emit(provider) {
    const payload = {
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

  async fetchKimi(token) {
    let res;
    try {
      res = await http.post(KIMI_API,
        { scope: ['FEATURE_CODING'] },
        {
          headers: {
            'Authorization': `Bearer ${token.trim()}`,
            'Content-Type': 'application/json',
          }
        }
      );
    } catch (e) {
      throw e; // 网络层/超时
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:kimi] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data;
    if (!json || typeof json !== 'object') {
      throw new Error('invalid response');
    }

    // 解析 totalQuota
    const total = json.totalQuota || {};
    const totalData = {
      limit: Number(total.limit) || 0,
      used: Number(total.used) || 0,
      remaining: Number(total.remaining) || 0,
      percent: this._calcPercent(total.remaining, total.limit)
    };

    // 解析 FEATURE_CODING usages 数组
    const usages = json.usages || [];
    const usage = usages[0] || {};

    // usages[0].detail        → 总/日配额 (resetTime 跨天)
    // usages[0].limits[0]     → 5h 窗口 (duration=300min)
    const dTotal = usage.detail || {};
    const d5h = (usage.limits || [])[0]?.detail || {};

    const codingWeekly = {
      limit:     Number(dTotal.limit)     || 0,
      used:      Number(dTotal.used)      || 0,
      remaining: Number(dTotal.remaining) || 0,
      percent:   this._calcPercent(dTotal.remaining, dTotal.limit),
      resetTime: dTotal.resetTime || null
    };

    const codingFiveHour = {
      limit:     Number(d5h.limit)     || 0,
      used:      Number(d5h.used)      || 0,
      remaining: Number(d5h.remaining) || 0,
      percent:   this._calcPercent(d5h.remaining, d5h.limit),
      resetTime: d5h.resetTime || null
    };

    console.log('[usage:kimi] fetched data:', { total: totalData, codingFiveHour, codingWeekly });

    return { total: totalData, codingFiveHour, codingWeekly };
  }

  // ==================== MiniMax ====================

  async fetchMiniMax(token) {
    let res;
    try {
      res = await http.get(MINIMAX_API, {
        headers: {
          'Authorization': `Bearer ${token.trim()}`
        }
      });
    } catch (e) {
      throw e;
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:minimax] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data;
    if (!json || json.base_resp?.status_code !== 0) {
      console.error('[usage:minimax] api error response:', JSON.stringify(json).slice(0, 500));
      throw new Error(json?.base_resp?.status_msg || 'api error');
    }

    // 只取 model_name === 'general' 那条
    const arr = json.model_remains || [];
    const general = arr.find(m => m.model_name === 'general');
    if (!general) {
      throw new Error('general model not found');
    }
    console.log('[usage:minimax] general model found:', {
      fiveHourPercent: Number(general.current_interval_remaining_percent) || 0,
      weeklyPercent: Number(general.current_weekly_remaining_percent) || 0,
      fiveHourResetTime: general.remains_time || null,
    });
    return {
      fiveHourPercent: Number(general.current_interval_remaining_percent) || 0,
      weeklyPercent: Number(general.current_weekly_remaining_percent) || 0,
      fiveHourResetTime: general.remains_time || null,
    };
  }

  // ==================== Copilot ====================

  // token 字段实际存的是从浏览器复制的整段 Cookie 串
  async fetchCopilot(cookie) {
    let res;
    try {
      res = await http.get(COPILOT_API, {
        headers: {
          'Cookie': cookie.trim(),
          'Referer': 'https://github.com/copilot',
          'Accept': 'application/json, text/plain, */*'
        }
      });
    } catch (e) {
      throw e;
    }

    if (res.status >= 400) {
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || {});
      console.error(`[usage:copilot] HTTP ${res.status}\n  body: ${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = res.data;
    if (!json || typeof json !== 'object' || !json.quotas) {
      throw new Error('invalid response');
    }

    const limits    = json.quotas.limits    || {};
    const remaining = json.quotas.remaining || {};

    const result = {
      premium: {
        limit:        Number(limits.premiumInteractions)    || 0,
        remaining:    Number(remaining.premiumInteractions) || 0,
        percent:      Number(remaining.premiumInteractionsPercentage) || 0,
        resetDate:    json.quotas.resetDate    || null,
        resetDateUtc: json.quotas.resetDateUtc || null
      },
      chat: { percent: Number(remaining.chatPercentage) || 0 },
      plan: json.plan || null,
      licenseType: json.licenseType || null
    };

    console.log('[usage:copilot] fetched data:', result);
    return result;
  }

  // ==================== Utilities ====================

  _calcPercent(remaining, limit) {
    const r = Number(remaining) || 0;
    const l = Number(limit) || 0;
    if (l <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((r / l) * 100)));
  }

  // 对外提供快照(用于 init 推送)
  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

// 把 axios 错误格式化成简短字符串
function formatAxiosError(e) {
  if (e.code === 'ECONNABORTED') return 'timeout';
  if (e.code === 'ENOTFOUND') return 'DNS 解析失败';
  if (e.code === 'ECONNREFUSED') return '连接被拒绝';
  if (e.response) {
    const body = typeof e.response.data === 'string'
      ? e.response.data
      : JSON.stringify(e.response.data || {});
    return `HTTP ${e.response.status}: ${body.slice(0, 200)}`;
  }
  return e.message || String(e);
}

module.exports = { UsageMonitor };
