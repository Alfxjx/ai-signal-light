import { describe, it, expect } from 'vitest';
import { decodeExp, isCodexTokenValid, mapWhamUsage, parseCodexAuthFile } from './codex';

/** 造一个带指定 exp 的假 JWT（仅结构合法，签名是假的） */
function fakeJwt(exp: number | null): string {
  const b64 = (o: Record<string, unknown>) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const payload = exp === null ? {} : { exp };
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

describe('decodeExp', () => {
  it('从 JWT payload 读出 exp', () => {
    expect(decodeExp(fakeJwt(1893456000))).toBe(1893456000);
  });

  it('payload 没有 exp 返回 null', () => {
    expect(decodeExp(fakeJwt(null))).toBeNull();
  });

  it('非三段结构 / 非法 base64 返回 null', () => {
    expect(decodeExp('not-a-jwt')).toBeNull();
    expect(decodeExp('a.!!!.c')).toBeNull();
  });
});

describe('parseCodexAuthFile', () => {
  it('解析 tokens.access_token / refresh_token / account_id / exp', () => {
    const raw = JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: {
        access_token: fakeJwt(1893456000),
        refresh_token: 'rt-123',
        account_id: 'acc-1',
      },
    });
    expect(parseCodexAuthFile(raw)).toEqual({
      accessToken: fakeJwt(1893456000),
      refreshToken: 'rt-123',
      accountId: 'acc-1',
      accessTokenExp: 1893456000,
    });
  });

  it('缺 access_token 或 refresh_token 返回 null', () => {
    expect(parseCodexAuthFile(JSON.stringify({ tokens: { access_token: 'x' } }))).toBeNull();
    expect(parseCodexAuthFile(JSON.stringify({ tokens: { refresh_token: 'y' } }))).toBeNull();
    expect(parseCodexAuthFile(JSON.stringify({}))).toBeNull();
  });

  it('非 JSON 输入返回 null', () => {
    expect(parseCodexAuthFile('not json')).toBeNull();
  });

  it('account_id 缺失时容忍为 null', () => {
    const raw = JSON.stringify({ tokens: { access_token: fakeJwt(100), refresh_token: 'r' } });
    expect(parseCodexAuthFile(raw)?.accountId).toBeNull();
  });
});

describe('isCodexTokenValid', () => {
  it('exp 超过 now+600s 才算有效（提前 10 分钟刷新）', () => {
    expect(isCodexTokenValid(1000 + 601, 1000)).toBe(true);
    expect(isCodexTokenValid(1000 + 600, 1000)).toBe(false);
    expect(isCodexTokenValid(1000, 1000)).toBe(false);
  });

  it('exp 为 null 视为无效', () => {
    expect(isCodexTokenValid(null)).toBe(false);
  });
});

describe('mapWhamUsage', () => {
  it('映射 primary/secondary 窗口，used_percent 超界被 clamp', () => {
    const json = {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 42, limit_window_seconds: 18000, reset_at: 1893456000 },
        secondary_window: { used_percent: 150, limit_window_seconds: 604800, reset_at: 1894000000 },
      },
      credits: { balance: 0 },
    };
    expect(mapWhamUsage(json)).toEqual({
      primary: { usedPercent: 42, resetAt: 1893456000 },
      secondary: { usedPercent: 100, resetAt: 1894000000 },
    });
  });

  it('窗口缺失 / 非对象时给 null', () => {
    expect(mapWhamUsage({})).toEqual({ primary: null, secondary: null });
    expect(mapWhamUsage({ rate_limit: { primary_window: 'x' } }).primary).toBeNull();
  });

  it('reset_at 非数字时容忍为 null', () => {
    const json = { rate_limit: { primary_window: { used_percent: 5, reset_at: 'soon' } } };
    expect(mapWhamUsage(json).primary).toEqual({ usedPercent: 5, resetAt: null });
  });
});
