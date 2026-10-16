import { describe, expect, it } from 'vitest';
import { buildJson } from './json.js';
import type { ProviderState } from 'providers-core';

const STATE: ProviderState = {
  id: 'kimi',
  name: 'Kimi',
  windows: [{ label: '5h', percent: 52, resetTime: '2026-10-16T15:00:00.000Z' }],
  balance: null,
  error: null,
  lastUpdated: '2026-10-16T12:00:00.000Z',
};

describe('buildJson', () => {
  it('输出 configPath / fetchedAt / providers 三段', () => {
    const json = buildJson('C:/cfg.json', [STATE], undefined, new Date('2026-10-16T12:00:00.000Z'));
    expect(json).toEqual({
      configPath: 'C:/cfg.json',
      fetchedAt: '2026-10-16T12:00:00.000Z',
      providers: [STATE],
    });
  });

  it('config 错误时带 error 字段', () => {
    const json = buildJson('C:/cfg.json', [], 'config.json 读取失败');
    expect(json.error).toBe('config.json 读取失败');
    expect(json.providers).toEqual([]);
  });
});
