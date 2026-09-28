import { describe, it, expect } from 'vitest';
import {
  displayWidth,
  errorLabel,
  formatBar,
  formatCountdown,
  formatHeader,
  formatMoney,
  formatPercent,
  formatProviderLine,
  levelFor,
  padToWidth,
  pickPrimary,
  truncateToWidth,
} from './format';
import type { ProviderState } from './types';

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

describe('formatBar / formatPercent / levelFor', () => {
  it('5 格条形按比例填充', () => {
    expect(formatBar(0)).toBe('░░░░░');
    expect(formatBar(50)).toBe('███░░');
    expect(formatBar(100)).toBe('█████');
  });

  it('百分比四舍五入并夹到 0-100', () => {
    expect(formatPercent(62.4)).toBe('62%');
    expect(formatPercent(-5)).toBe('0%');
    expect(formatPercent(140)).toBe('100%');
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
});

describe('formatHeader', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it('没有更新时间时显示拉取中', () => {
    expect(formatHeader(null, now)).toBe('用量  拉取中…');
  });

  it('按分钟/小时显示新鲜度', () => {
    expect(formatHeader(now - 30_000, now)).toBe('用量  刷新 刚刚');
    expect(formatHeader(now - 2 * 60_000, now)).toBe('用量  刷新 2m前');
    expect(formatHeader(now - 3 * 3_600_000, now)).toBe('用量  刷新 3h前');
  });
});

describe('formatProviderLine', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');
  const base: ProviderState = {
    id: 'kimi',
    name: 'Kimi',
    windows: [],
    balance: null,
    error: null,
    lastUpdated: null,
  };

  it('Kimi 双窗口取大的那个并标窗口名', () => {
    const state: ProviderState = {
      ...base,
      windows: [
        { label: '5h', percent: 34, resetTime: '2026-09-28T15:00:00Z' },
        { label: '周', percent: 62, resetTime: '2026-09-30T12:00:00Z' },
      ],
    };
    const line = formatProviderLine(state, 8, THRESHOLDS, now);
    expect(line.text).toBe('Kimi     ███░░ 62% 周 2d');
    expect(line.level).toBe('warn');
  });

  it('余额型显示货币金额', () => {
    const state: ProviderState = { ...base, id: 'deepseek', name: 'DeepSeek', balance: { currency: 'CNY', total: 12.4 } };
    const line = formatProviderLine(state, 8, THRESHOLDS, now);
    expect(line.text).toBe('DeepSeek ¥12.40');
    expect(line.level).toBe('fresh');
  });

  it('未配置是灰的，鉴权失败是红的', () => {
    expect(formatProviderLine({ ...base, id: 'mimo', name: 'MiMo', error: 'no_token' }, 8, THRESHOLDS, now))
      .toEqual({ text: 'MiMo     － 未配置', level: 'muted' });
    expect(formatProviderLine({ ...base, error: '鉴权失败' }, 8, THRESHOLDS, now).level).toBe('danger');
  });
});
