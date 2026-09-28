import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseJsonObject, numberOr, httpRequest, UsageError } from './http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseJsonObject', () => {
  it('解析对象', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('数组 / 标量 / 坏 JSON 一律回落到空对象', () => {
    expect(parseJsonObject('[1,2]')).toEqual({});
    expect(parseJsonObject('42')).toEqual({});
    expect(parseJsonObject('{ nope')).toEqual({});
    expect(parseJsonObject('')).toEqual({});
  });
});

describe('numberOr', () => {
  it('能转数字就用，否则回落', () => {
    expect(numberOr('12', 0)).toBe(12);
    expect(numberOr(undefined, 7)).toBe(7);
    expect(numberOr('abc', 7)).toBe(7);
  });
});

describe('httpRequest', () => {
  it('返回 status 与 body 文本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    const res = await httpRequest('https://example.com');
    expect(res.status).toBe(200);
    expect(res.text).toBe('{"ok":true}');
  });

  it('中继 fetch 抛错时转成「网络错误」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch'); }));
    await expect(httpRequest('https://example.com')).rejects.toThrow(UsageError);
    await expect(httpRequest('https://example.com')).rejects.toThrow('网络错误');
  });

  it('abort 时转成「超时」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }));
    await expect(httpRequest('https://example.com')).rejects.toThrow('超时');
  });
});
