import { describe, it, expect } from 'vitest';
import { mapVolcengineUsage, parseCookieJar } from './volcengine';

describe('mapVolcengineUsage', () => {
  it('解析三档定额，Percent 就是「已用 %」', () => {
    const real = {
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 6.0932815, ResetTimestamp: 1787639742, Cap: 100 },
          { Level: 'weekly', Percent: 0.8124375333333332, ResetTimestamp: 1788105600, Cap: 100 },
          { Level: 'monthly', Percent: 0.4062187666666666, ResetTimestamp: 1790351999, Cap: 100 },
        ],
      },
    };
    const windows = mapVolcengineUsage(real);
    expect(windows.map((w) => w.label)).toEqual(['5h', '周', '月']);
    expect(windows.map((w) => w.percent)).toEqual([6, 1, 0]);
    expect(windows[0].resetTime).toBe(new Date(1787639742 * 1000).toISOString());
  });

  it('兼容 AK/SK 通道的 ResetTime 字段名', () => {
    const windows = mapVolcengineUsage({
      Result: {
        QuotaUsage: [
          { Level: 'session', Percent: 12.5, Cap: 100, ResetTime: 1787639742 },
          { Level: 'weekly', Percent: 30, Cap: 100, ResetTime: 1788105600 },
          { Level: 'monthly', Percent: 45, Cap: 100, ResetTime: 1790351999 },
        ],
      },
    });
    expect(windows.map((w) => w.percent)).toEqual([13, 30, 45]);
    expect(windows[1].resetTime).toBe(new Date(1788105600 * 1000).toISOString());
  });

  it('缺少 QuotaUsage 时容错为 0 且无重置时间', () => {
    const windows = mapVolcengineUsage({});
    expect(windows.map((w) => w.percent)).toEqual([0, 0, 0]);
    expect(windows[2].resetTime).toBeNull();
  });
});

describe('parseCookieJar', () => {
  it('解析 "a=1; b=2"', () => {
    expect(parseCookieJar('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('值里含等号时只按首个等号切分', () => {
    expect(parseCookieJar('token=ab=cd==')).toEqual({ token: 'ab=cd==' });
  });

  it('容忍空片段与多余空格', () => {
    expect(parseCookieJar('  a=1 ;; ; b = 2 ;flag; c=')).toEqual({ a: '1', b: '2', c: '' });
  });
});
