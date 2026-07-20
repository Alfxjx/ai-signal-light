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
