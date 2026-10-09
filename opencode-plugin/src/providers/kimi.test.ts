import { describe, it, expect } from 'vitest';
import { calcPercent, mapKimiUsages } from './kimi';

describe('calcPercent', () => {
  it('按 used/limit 取整并夹到 0-100', () => {
    expect(calcPercent(1, 3)).toBe(33);
    expect(calcPercent(150, 100)).toBe(100);
    expect(calcPercent(-10, 100)).toBe(0);
    expect(calcPercent(100, 0)).toBe(0);
    expect(calcPercent('25', '100')).toBe(25);
  });
});

describe('mapKimiUsages', () => {
  it('解析 7 天窗口(usage)与 5 小时窗口(limits[0].detail)', () => {
    const json = {
      usage: { limit: '100', used: '31', remaining: '69', resetTime: '2026-08-28T13:24:22Z' },
      limits: [
        {
          window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
          detail: { limit: '100', used: '34', remaining: '66', resetTime: '2026-08-25T02:24:22Z' },
        },
      ],
    };
    expect(mapKimiUsages(json)).toEqual({
      weekly: { limit: 100, used: 31, remaining: 69, percent: 31, resetTime: '2026-08-28T13:24:22Z' },
      fiveHour: { limit: 100, used: 34, remaining: 66, percent: 34, resetTime: '2026-08-25T02:24:22Z' },
    });
  });

  it('缺字段时容错为 0', () => {
    const r = mapKimiUsages({});
    expect(r.weekly.percent).toBe(0);
    expect(r.fiveHour.resetTime).toBeNull();
    expect(r.fiveHour.limit).toBe(0);
  });
});
