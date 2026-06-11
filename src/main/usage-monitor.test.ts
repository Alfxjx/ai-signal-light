import { describe, it, expect } from 'vitest';
import { calcPercent, parseProxyUrl, formatAxiosError } from './usage-monitor';
import type { AxiosProxyConfig } from 'axios';

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
