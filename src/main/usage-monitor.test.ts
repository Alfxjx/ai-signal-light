import { describe, it, expect } from 'vitest';
import { calcPercent, parseProxyUrl, formatAxiosError, mapDeepseekBalance, mapWhamUsage, mapKimiUsages, mapVolcengineUsage } from './usage-monitor';
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
