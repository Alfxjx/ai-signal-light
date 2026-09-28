import { describe, it, expect } from 'vitest';
import { calcPercent, parseProxyUrl, formatAxiosError, mapDeepseekBalance, mapWhamUsage, mapKimiUsages, mapVolcengineUsage, mapMimoBalance, parseCookieJar, mergeCookiePair } from './usage-monitor';
import type { AxiosProxyConfig } from 'axios';

describe('mapKimiUsages', () => {
  it('解析 7 天窗口(usage)与 5 小时窗口(limits[0].detail)', () => {
    const json = {
      usage: { limit: '100', used: '31', remaining: '69', resetTime: '2026-08-28T13:24:22Z' },
      limits: [
        {
          window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
          detail: { limit: '100', used: '34', remaining: '66', resetTime: '2026-08-25T02:24:22Z' },
        }
      ],
    };
    expect(mapKimiUsages(json)).toEqual({
      codingWeekly: { limit: 100, used: 31, remaining: 69, percent: 31, resetTime: '2026-08-28T13:24:22Z' },
      codingFiveHour: { limit: 100, used: 34, remaining: 66, percent: 34, resetTime: '2026-08-25T02:24:22Z' },
    });
  });
  it('缺字段时容错为 0', () => {
    const r = mapKimiUsages({});
    expect(r.codingWeekly.percent).toBe(0);
    expect(r.codingFiveHour.resetTime).toBeNull();
    expect(r.codingFiveHour.limit).toBe(0);
  });
});

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

describe('mapVolcengineUsage', () => {
  it('解析三档定额', () => {
    const real = {
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 6.0932815, ResetTimestamp: 1787639742, Cap: 100, RewardTotalPercent: 0 },
          { Level: 'weekly', Percent: 0.8124375333333332, ResetTimestamp: 1788105600, Cap: 100, RewardTotalPercent: 0 },
          { Level: 'monthly', Percent: 0.4062187666666666, ResetTimestamp: 1790351999, Cap: 100, RewardTotalPercent: 0 },
        ],
      },
    } as unknown as Record<string, unknown>;
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
  it('兼容 AK/SK 通道的 ResetTime 字段名', () => {
    const json = {
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 12.5, Cap: 100, ResetTime: 1787639742 },
          { Level: 'weekly', Percent: 30, Cap: 100, ResetTime: 1788105600 },
          { Level: 'monthly', Percent: 45, Cap: 100, ResetTime: 1790351999 },
        ],
      },
    } as unknown as Record<string, unknown>;
    const r = mapVolcengineUsage(json);
    expect(r.session.percent).toBe(13);
    expect(r.session.resetTime).toBe(new Date(1787639742 * 1000).toISOString());
    expect(r.weekly.resetTime).toBe(new Date(1788105600 * 1000).toISOString());
  });
});

describe('parseCookieJar / mergeCookiePair', () => {
  it('解析 "a=1; b=2" 形式的 Cookie 串', () => {
    expect(parseCookieJar('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });
  it('容忍空片段、缺失等号与多余空格', () => {
    expect(parseCookieJar('  a=1 ;; ; b = 2 ;flag; c=')).toEqual({ a: '1', b: '2', c: '' });
  });
  it('值里含等号时只按首个等号切分', () => {
    expect(parseCookieJar('token=ab=cd==')).toEqual({ token: 'ab=cd==' });
  });
  it('空串返回空 jar', () => {
    expect(parseCookieJar('')).toEqual({});
  });
  it('mergeCookiePair 同名覆盖、新增追加', () => {
    const jar = { a: '1', csrfToken: 'old' };
    mergeCookiePair(jar, 'csrfToken=new');
    mergeCookiePair(jar, 'b=2');
    expect(jar).toEqual({ a: '1', csrfToken: 'new', b: '2' });
  });
  it('mergeCookiePair 忽略空片段与无等号项', () => {
    const jar = {};
    mergeCookiePair(jar, '');
    mergeCookiePair(jar, '   ');
    mergeCookiePair(jar, 'noequals');
    expect(jar).toEqual({});
  });
});

describe('mapMimoBalance', () => {
  it('解析 data 信封内的总额/赠送/充值', () => {
    const json = {
      code: 0,
      data: { currency: 'CNY', totalBalance: '21.66', grantedBalance: '1.66', paidBalance: '20.00' },
    };
    expect(mapMimoBalance(json)).toEqual({
      isAvailable: true, currency: 'CNY',
      totalBalance: 21.66, grantedBalance: 1.66, paidBalance: 20,
    });
  });
  it('兼容 snake_case 字段名与嵌套 balance 对象', () => {
    const json = { data: { balance: { total_balance: '30.5', granted_balance: '0.5' } } };
    const r = mapMimoBalance(json);
    expect(r.totalBalance).toBe(30.5);
    expect(r.grantedBalance).toBe(0.5);
    // 只给总额 + 赠送时，充值额用减法补齐
    expect(r.paidBalance).toBe(30);
    expect(r.currency).toBe('CNY');
  });
  it('balance 为嵌套对象时也能取到总额', () => {
    const r = mapMimoBalance({ balance: { total: 12.34, paid: 12.34, granted: 0 } });
    expect(r.totalBalance).toBe(12.34);
    expect(r.paidBalance).toBe(12.34);
    expect(r.grantedBalance).toBe(0);
  });
  it('带 scale 倍率字段时换算金额单位', () => {
    const r = mapMimoBalance({ data: { scale: 100, totalBalance: 2166, grantedBalance: 166 } });
    expect(r.totalBalance).toBe(21.66);
    expect(r.grantedBalance).toBe(1.66);
  });
  it('只有总额时全额算赠送，余额为 0 视为不可用', () => {
    const r = mapMimoBalance({ data: { totalBalance: 0 } });
    expect(r.isAvailable).toBe(false);
    expect(r.grantedBalance).toBe(0);
    expect(r.paidBalance).toBe(0);
  });
  it('找不到任何余额字段时抛错', () => {
    expect(() => mapMimoBalance({ data: { foo: 1 } })).toThrow('no balance info');
  });
});

describe('calcPercent', () => {
  it('returns 0 when limit is 0', () => {
    expect(calcPercent(100, 0)).toBe(0);
  });

  it('caps at 100', () => {
    expect(calcPercent(150, 100)).toBe(100);
  });

  it('floors at 0', () => {
    expect(calcPercent(-10, 100)).toBe(0);
  });

  it('rounds correctly', () => {
    expect(calcPercent(1, 3)).toBe(33);
  });

  it('returns 50 for half', () => {
    expect(calcPercent(50, 100)).toBe(50);
  });

  it('handles string inputs', () => {
    expect(calcPercent('25', '100')).toBe(25);
  });
});

describe('parseProxyUrl', () => {
  it('returns null for empty string', () => {
    expect(parseProxyUrl('')).toBeNull();
  });

  it('parses http proxy without auth', () => {
    const result = parseProxyUrl('http://proxy.example.com:8080');
    expect(result).toEqual({
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080
    });
  });

  it('parses https proxy with auth', () => {
    const result = parseProxyUrl('http://user:pass@proxy.example.com:8080');
    expect(result).toEqual({
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080,
      auth: { username: 'user', password: 'pass' }
    });
  });

  it('uses default port for https', () => {
    const result = parseProxyUrl('https://proxy.example.com');
    expect(result).toEqual({
      protocol: 'https',
      host: 'proxy.example.com',
      port: 443
    });
  });

  it('returns null for invalid URL', () => {
    expect(parseProxyUrl('not-a-url')).toBeNull();
  });
});

describe('formatAxiosError', () => {
  it('returns timeout for ECONNABORTED', () => {
    expect(formatAxiosError({ code: 'ECONNABORTED' })).toBe('timeout');
  });

  it('returns DNS error for ENOTFOUND', () => {
    expect(formatAxiosError({ code: 'ENOTFOUND' })).toBe('DNS 解析失败');
  });

  it('returns connection refused for ECONNREFUSED', () => {
    expect(formatAxiosError({ code: 'ECONNREFUSED' })).toBe('连接被拒绝');
  });

  it('formats response error', () => {
    const error = {
      response: {
        status: 401,
        data: 'Unauthorized'
      }
    };
    expect(formatAxiosError(error)).toBe('HTTP 401: Unauthorized');
  });

  it('falls back to message', () => {
    expect(formatAxiosError(new Error('something broke'))).toBe('something broke');
  });

  it('handles plain string', () => {
    expect(formatAxiosError('plain error')).toBe('plain error');
  });
});
