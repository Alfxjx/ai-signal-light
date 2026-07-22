import { describe, it, expect } from 'vitest';
import { calcUsagePace, paceText, paceArrow, inferAllPlanWindowMs } from './usage';

const HOUR = 60 * 60 * 1000;
const WINDOW_5H = 5 * HOUR;

describe('calcUsagePace', () => {
  it('returns null when resetTime is missing', () => {
    expect(calcUsagePace(30, null, WINDOW_5H, Date.now())).toEqual({ pace: null, delta: null, expectedPercent: null });
    expect(calcUsagePace(30, undefined, WINDOW_5H, Date.now())).toEqual({ pace: null, delta: null, expectedPercent: null });
  });

  it('returns null when window is invalid', () => {
    const reset = Date.now() + 2 * HOUR;
    expect(calcUsagePace(30, reset, 0, Date.now())).toEqual({ pace: null, delta: null, expectedPercent: null });
    expect(calcUsagePace(30, reset, -1, Date.now())).toEqual({ pace: null, delta: null, expectedPercent: null });
  });

  it('returns null when already reset or remaining >= window', () => {
    const now = Date.now();
    expect(calcUsagePace(30, now - 1000, WINDOW_5H, now)).toEqual({ pace: null, delta: null, expectedPercent: null });
    expect(calcUsagePace(30, now + WINDOW_5H, WINDOW_5H, now)).toEqual({ pace: null, delta: null, expectedPercent: null });
    expect(calcUsagePace(30, now + WINDOW_5H + 1000, WINDOW_5H, now)).toEqual({ pace: null, delta: null, expectedPercent: null });
  });

  it('detects fast pace when used % is ahead of expected average', () => {
    // 5h 窗口，已过去 4h，剩余 1h；期望平均 = 80%；当前已用 90% → fast
    const now = Date.now();
    const reset = now + 1 * HOUR;
    const result = calcUsagePace(90, reset, WINDOW_5H, now, 5);
    expect(result.pace).toBe('fast');
    expect(result.delta).toBeCloseTo(10, 1);
    expect(result.expectedPercent).toBeCloseTo(80, 1);
  });

  it('detects slow pace when used % is behind expected average', () => {
    // 已过去 4h，期望 80%；当前已用 60% → slow
    const now = Date.now();
    const reset = now + 1 * HOUR;
    const result = calcUsagePace(60, reset, WINDOW_5H, now, 5);
    expect(result.pace).toBe('slow');
    expect(result.delta).toBeCloseTo(-20, 1);
    expect(result.expectedPercent).toBeCloseTo(80, 1);
  });

  it('detects average pace within threshold', () => {
    // 已过去 2.5h，期望 50%；当前 52% → average
    const now = Date.now();
    const reset = now + 2.5 * HOUR;
    const result = calcUsagePace(52, reset, WINDOW_5H, now, 5);
    expect(result.pace).toBe('average');
    expect(result.delta).toBeCloseTo(2, 1);
    expect(result.expectedPercent).toBeCloseTo(50, 1);
  });

  it('respects custom threshold', () => {
    const now = Date.now();
    const reset = now + 2.5 * HOUR; // 50% expected
    // delta = 4%，默认阈值 5 → average；阈值 2 → fast
    expect(calcUsagePace(54, reset, WINDOW_5H, now, 5).pace).toBe('average');
    expect(calcUsagePace(54, reset, WINDOW_5H, now, 2).pace).toBe('fast');
  });
});

describe('pace helpers', () => {
  it('returns correct text and arrow', () => {
    expect(paceText('fast')).toBe('快');
    expect(paceText('slow')).toBe('慢');
    expect(paceText('average')).toBe('均');
    expect(paceText(null)).toBe('');

    expect(paceArrow('fast')).toBe('↑');
    expect(paceArrow('slow')).toBe('↓');
    expect(paceArrow('average')).toBe('—');
    expect(paceArrow(null)).toBe('');
  });
});

describe('inferAllPlanWindowMs', () => {
  it('returns null when already expired', () => {
    const now = Date.now();
    expect(inferAllPlanWindowMs(now - 1000, now)).toBeNull();
  });

  it('infers monthly window when remaining is short', () => {
    const now = Date.now();
    const reset = now + 20 * 24 * 60 * 60 * 1000;
    expect(inferAllPlanWindowMs(reset, now)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('infers yearly window when remaining is long', () => {
    const now = Date.now();
    const reset = now + 200 * 24 * 60 * 60 * 1000;
    expect(inferAllPlanWindowMs(reset, now)).toBe(365 * 24 * 60 * 60 * 1000);
  });
});
