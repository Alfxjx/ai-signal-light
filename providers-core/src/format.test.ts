import { describe, it, expect } from 'vitest';
import {
  displayWidth,
  errorLabel,
  formatCountdown,
  formatFreshness,
  formatMoney,
  formatPercent,
  levelFor,
  padLeft,
  padToWidth,
  pickPrimary,
  truncateToWidth,
} from './format';
import type { WindowView } from './types';

const THRESHOLDS = { warn: 50, danger: 80 };

describe('displayWidth / padToWidth / truncateToWidth', () => {
  it('CJK 算 2 列，ASCII 算 1 列', () => {
    expect(displayWidth('Kimi')).toBe(4);
    expect(displayWidth('火山')).toBe(4);
    expect(displayWidth('DeepSeek')).toBe(8);
  });

  it('按显示宽度补齐', () => {
    expect(padToWidth('火山', 8)).toBe('火山    ');
    expect(padToWidth('MiniMax', 8)).toBe('MiniMax ');
    expect(padToWidth('Kimi', 8)).toBe('Kimi    ');
  });

  it('padToWidth 补右边，padLeft 补左边（右对齐数字列用后者）', () => {
    expect(padToWidth('5%', 4)).toBe('5%  ');
    expect(padLeft('5%', 4)).toBe('  5%');
    expect(padLeft('100%', 4)).toBe('100%');
  });

  it('padLeft 超宽时截断而不是补负数空格', () => {
    expect(padLeft('DeepSeek', 4)).toBe('Dee…');
  });

  it('超宽时截断并加省略号，总宽度不超过目标', () => {
    expect(displayWidth(truncateToWidth('DeepSeek', 6))).toBeLessThanOrEqual(6);
    expect(truncateToWidth('DeepSeek', 6)).toBe('DeepS…');
    expect(truncateToWidth('火山引擎', 5)).toBe('火山…');
  });

  it('宽度不足时返回空串，不陷入死循环', () => {
    expect(truncateToWidth('火山', 0)).toBe('');
    expect(truncateToWidth('Kimi', -1)).toBe('');
  });
});

describe('formatPercent / levelFor', () => {
  it('百分比四舍五入并夹到 0-100', () => {
    expect(formatPercent(62.4)).toBe('62%');
    expect(formatPercent(-5)).toBe('0%');
    expect(formatPercent(140)).toBe('100%');
  });

  it('百分比恒被 clamp 到 0-100，最多 3 位数字（无千分位）', () => {
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(1000)).toBe('100%');
  });

  it('阈值用严格大于判定', () => {
    expect(levelFor(50, THRESHOLDS)).toBe('fresh');
    expect(levelFor(51, THRESHOLDS)).toBe('warn');
    expect(levelFor(80, THRESHOLDS)).toBe('warn');
    expect(levelFor(81, THRESHOLDS)).toBe('danger');
  });
});

describe('formatCountdown', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it('绝对时间按 天 / 小时 / 分钟 取最大单位', () => {
    expect(formatCountdown('2026-09-30T12:00:00Z', now)).toBe('2d');
    expect(formatCountdown('2026-09-28T15:00:00Z', now)).toBe('3h');
    expect(formatCountdown('2026-09-28T12:30:00Z', now)).toBe('30m');
  });

  it('数字小于 365 天视为「距重置的相对毫秒」', () => {
    expect(formatCountdown(String(90 * 60 * 1000), now)).toBe('1h');
  });

  it('已过期或不可解析返回空串', () => {
    expect(formatCountdown('2026-09-28T11:00:00Z', now)).toBe('');
    expect(formatCountdown(null, now)).toBe('');
    expect(formatCountdown('not-a-date', now)).toBe('');
  });
});

describe('formatMoney', () => {
  it('按货币代码给符号，缺省两位小数', () => {
    expect(formatMoney('CNY', 12.4)).toBe('¥12.40');
    expect(formatMoney(null, 0)).toBe('¥0.00');
    expect(formatMoney('USD', 3.5)).toBe('$3.50');
  });
});

describe('errorLabel', () => {
  it('no_token 显示成「未配置」，其余原样', () => {
    expect(errorLabel('no_token')).toBe('未配置');
    expect(errorLabel('鉴权失败')).toBe('鉴权失败');
  });
});

describe('pickPrimary', () => {
  it('取已用 % 最大的窗口', () => {
    const primary = pickPrimary([
      { label: '5h', percent: 34, resetTime: null },
      { label: '周', percent: 62, resetTime: null },
    ]);
    expect(primary?.label).toBe('周');
  });

  it('空数组返回 null', () => {
    expect(pickPrimary([])).toBeNull();
  });

  it('并列时保留靠前的窗口', () => {
    const windows: WindowView[] = [
      { label: '5h', percent: 62, resetTime: null },
      { label: '周', percent: 62, resetTime: null },
    ];
    expect(pickPrimary(windows)?.label).toBe('5h');
  });
});

describe('formatFreshness', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it('没有更新时间时显示拉取中', () => {
    expect(formatFreshness(null, now)).toBe('拉取中…');
  });

  it('按分钟/小时显示新鲜度（不含「用量」前缀，交给 flex 撑开）', () => {
    expect(formatFreshness(now - 30_000, now)).toBe('刚刚');
    expect(formatFreshness(now - 2 * 60_000, now)).toBe('2m 前');
    expect(formatFreshness(now - 3 * 3_600_000, now)).toBe('3h 前');
  });

  it('未来时间不会显示负数', () => {
    expect(formatFreshness(now + 60_000, now)).toBe('刚刚');
  });
});

