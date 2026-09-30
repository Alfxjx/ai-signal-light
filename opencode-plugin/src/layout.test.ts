import { describe, it, expect } from 'vitest';
import {
  layoutPlan,
  percentColumnWidth,
  resetColumnWidth,
  COLLAPSED_GLYPH,
  EXPANDED_GLYPH,
  DOT_EMPTY,
  DOT_FILLED,
  BAR_DOTS,
  LABEL_WIDTH,
  providerMark,
} from './layout';
import { displayWidth } from './format';
import type { LayoutInput, RenderedBlock } from './layout';
import { DEFAULT_THRESHOLDS } from './config';
import type { ProviderState } from './types';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const T = DEFAULT_THRESHOLDS;

function base(overrides: Partial<ProviderState> = {}): ProviderState {
  return {
    id: 'kimi',
    name: 'Kimi',
    windows: [],
    balance: null,
    error: null,
    lastUpdated: null,
    ...overrides,
  };
}

function plan(
  providers: ProviderState[],
  overrides: Partial<LayoutInput> = {},
): RenderedBlock[] {
  return layoutPlan({
    updatedAt: NOW - 2 * 60_000,
    configError: null,
    thresholds: T,
    providers,
    now: NOW,
    collapsed: false,
    ...overrides,
  });
}

const kimiTwoWindows: ProviderState = base({
  windows: [
    { label: '5h', percent: 18, resetTime: '2026-09-28T12:27:00Z' },
    { label: '周', percent: 31, resetTime: '2026-09-30T12:00:00Z' },
  ],
});

describe('表头', () => {
  it('展开态带 ▾ 三角 + 「用量」，右侧是新鲜度', () => {
    expect(plan([kimiTwoWindows])[0]).toEqual({
      kind: 'header',
      left: `${EXPANDED_GLYPH} 用量`,
      right: '2m 前',
      collapsed: false,
    });
  });

  it('折叠态三角换成 ▸', () => {
    const head = plan([], { collapsed: true })[0];
    expect(head).toMatchObject({ left: `${COLLAPSED_GLYPH} 用量`, collapsed: true });
  });

  it('没有更新时间时右侧显示拉取中', () => {
    expect(plan([], { updatedAt: null })[0]).toMatchObject({ right: '拉取中…' });
  });
});

describe('折叠态', () => {
  it('整个侧边栏只剩表头一行，不列任何 provider', () => {
    const blocks = plan([kimiTwoWindows], { collapsed: true });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('header');
  });

  it('数据再满，折叠后也只有一行', () => {
    const hot = base({ name: '火山', windows: [{ label: '月', percent: 91, resetTime: null }] });
    const b = base({ id: 'deepseek', name: 'DeepSeek', balance: { currency: 'CNY', total: 29.06 } });
    const failed = base({ id: 'mimo', name: 'MiMo', error: '鉴权失败' });
    expect(plan([kimiTwoWindows, hot, b, failed], { collapsed: true })).toHaveLength(1);
  });

  it('折叠时 configError 不展示（省空间，展开才看得到）', () => {
    const blocks = plan([], { collapsed: true, configError: 'config.json 读取失败' });
    expect(blocks.some((b) => b.kind === 'note')).toBe(false);
  });
});

describe('展开态：结构', () => {
  it('百分比型 = 1 行标题 + 每个窗口 1 行', () => {
    expect(plan([kimiTwoWindows]).map((b) => b.kind)).toEqual([
      'header',
      'providerHead',
      'window',
      'window',
    ]);
  });

  it('窗口行带标签 / 百分比 / 倒计时 / 档位', () => {
    const [, , w] = plan([kimiTwoWindows]);
    expect(w).toEqual({
      kind: 'window',
      label: '5h',
      percent: 18,
      percentText: '18%',
      resetText: '27m',
      level: 'fresh',
    });
  });

  it('余额型 = 单行 balance，与百分比型结构不同', () => {
    const deepseek = base({ id: 'deepseek', name: 'DeepSeek', balance: { currency: 'CNY', total: 29.06 } });
    expect(plan([deepseek])[1]).toEqual({
      kind: 'balance',
      id: 'deepseek',
      name: 'DeepSeek',
      amount: '¥29.06',
      level: 'fresh',
    });
  });

  it('美元余额带 $ 符号', () => {
    const d = base({ balance: { currency: 'USD', total: 3.5 } });
    expect(plan(d ? [d] : [])[1]).toMatchObject({ amount: '$3.50' });
  });

  it('provider 顺序原样保留（由 enabledProviders 决定）', () => {
    const a = base({ id: 'kimi', name: 'Kimi', balance: { currency: 'CNY', total: 1 } });
    const b = base({ id: 'mimo', name: 'MiMo', balance: { currency: 'CNY', total: 2 } });
    const c = base({ id: 'volcengine', name: '火山', balance: { currency: 'CNY', total: 3 } });
    // 跳过表头
    const names = plan([a, b, c]).slice(1).map((blk) => (blk as { name: string }).name);
    expect(names).toEqual(['Kimi', 'MiMo', '火山']);
  });

  it('没有 provider 时只有表头', () => {
    expect(plan([])).toHaveLength(1);
  });
});

describe('展开态：档位', () => {
  it('provider 标题行按最紧（已用 % 最高）的窗口着色', () => {
    const state = base({
      windows: [
        { label: '5h', percent: 18, resetTime: null },
        { label: '周', percent: 62, resetTime: null },
      ],
    });
    const [, head, w5h, week] = plan(state ? [state] : []);
    expect(head).toEqual({ kind: 'providerHead', id: 'kimi', name: 'Kimi', level: 'warn' });
    expect((w5h as { level: string }).level).toBe('fresh');
    expect((week as { level: string }).level).toBe('warn');
  });

  it('阈值严格大于判定：80 仍是 warn，81 才是 danger', () => {
    const at80 = base({ windows: [{ label: '周', percent: 80, resetTime: null }] });
    const at81 = base({ windows: [{ label: '周', percent: 81, resetTime: null }] });
    expect(plan([at80])[1]).toMatchObject({ kind: 'providerHead', level: 'warn' });
    expect(plan([at81])[1]).toMatchObject({ kind: 'providerHead', level: 'danger' });
  });

  it('没有窗口也没有错误时标题行带占位短横', () => {
    expect(plan([base()])[1]).toEqual({ kind: 'providerHead', id: 'kimi', name: 'Kimi  －', level: 'muted' });
  });
});

describe('展开态：错误', () => {
  it('鉴权失败是红字，no_token 是灰字，都带原因', () => {
    const failed = base({ error: '鉴权失败' });
    const unconfigured = base({ id: 'mimo', name: 'MiMo', error: 'no_token' });
    expect(plan([failed])[1]).toEqual({ kind: 'note', id: 'kimi', text: 'Kimi  － 鉴权失败', level: 'danger' });
    expect(plan([unconfigured])[1]).toEqual({ kind: 'note', id: 'mimo', text: 'MiMo  － 未配置', level: 'muted' });
  });

  it('configError 插在表头之后、provider 之前', () => {
    const blocks = plan([kimiTwoWindows], { configError: 'config.json 读取失败' });
    expect(blocks[1]).toEqual({ kind: 'note', text: 'config.json 读取失败', level: 'danger' });
    expect(blocks[2].kind).toBe('providerHead');
  });
});

describe('单家刷新按钮的挂载点（provider id）', () => {
  it('百分比型：标题行带 provider id，窗口行不带', () => {
    const blocks = plan([kimiTwoWindows]);
    expect(blocks[1]).toMatchObject({ kind: 'providerHead', id: 'kimi' });
    expect(blocks[2]).not.toHaveProperty('id');
  });

  it('余额型：行带 provider id', () => {
    const b = base({ id: 'deepseek', name: 'DeepSeek', balance: { currency: 'CNY', total: 1 } });
    expect(plan([b])[1]).toMatchObject({ kind: 'balance', id: 'deepseek' });
  });

  it('provider 的错误行带 id（可单独重试），configError 不带（没有对应 provider）', () => {
    expect(plan([base({ error: '鉴权失败' })])[1]).toMatchObject({ kind: 'note', id: 'kimi' });
    const cfg = plan([], { configError: 'config.json 读取失败' });
    expect(cfg[1]).not.toHaveProperty('id');
  });
});

describe('倒计时', () => {
  it('已过期时 resetText 是空串，渲染层自然不占位', () => {
    const expired = base({ windows: [{ label: '5h', percent: 10, resetTime: '2026-09-28T11:00:00Z' }] });
    expect(plan([expired])[2]).toMatchObject({ resetText: '' });
  });
});

describe('固定列宽（对齐）', () => {
  it('percentColumnWidth 取本轮最大位数，最少 3 列', () => {
    expect(percentColumnWidth([kimiTwoWindows])).toBe(3); // '18%'
    const wide = base({ windows: [{ label: '周', percent: 100, resetTime: null }] });
    expect(percentColumnWidth([wide])).toBe(4); // '100%'
    expect(percentColumnWidth([])).toBe(3);
  });

  it('resetColumnWidth 取本轮最大位数，全为空则 0', () => {
    // '27m'(3) / ' 2d'(3)
    expect(resetColumnWidth([kimiTwoWindows], NOW)).toBe(3);
    const none = base({ windows: [{ label: '5h', percent: 5, resetTime: null }] });
    expect(resetColumnWidth([none], NOW)).toBe(0);
  });

  it('三位数天数（400d）需要 4 列，整列一起撑宽', () => {
    const far = base({ windows: [{ label: '月', percent: 5, resetTime: '2027-11-02T12:00:00Z' }] });
    expect(resetColumnWidth([far], NOW)).toBe(4);
    expect(plan([far])[2]).toMatchObject({ resetText: '400d' });
  });

  it('百分比右对齐补齐，位数不同的行宽度一致', () => {
    const mixed = base({
      windows: [
        { label: '5h', percent: 5, resetTime: null },
        { label: '周', percent: 42, resetTime: null },
        { label: '月', percent: 100, resetTime: null },
      ],
    });
    const texts = plan([mixed]).slice(2).map((b) => (b as { percentText: string }).percentText);
    expect(texts).toEqual(['  5%', ' 42%', '100%']);
    expect(new Set(texts.map((t) => t.length)).size).toBe(1);
  });

  it('倒计时同样右对齐补齐到固定列宽', () => {
    const mixed = base({
      windows: [
        { label: '5h', percent: 5, resetTime: '2026-09-28T12:27:00Z' }, // '27m'
        { label: '月', percent: 6, resetTime: '2026-10-10T12:00:00Z' }, // '12d'
      ],
    });
    const resets = plan([mixed]).slice(2).map((b) => (b as { resetText: string }).resetText);
    expect(resets).toEqual(['27m', '12d']);
    expect(new Set(resets.map((t) => t.length)).size).toBe(1);
  });

  it('没有倒计时时该行 resetText 为空，不占位', () => {
    const none = base({ windows: [{ label: '5h', percent: 5, resetTime: null }] });
    expect(plan([none])[2]).toMatchObject({ resetText: '' });
  });
});

describe('点阵进度条常量', () => {
  it('填充用实心圆点、空槽用中点', () => {
    expect(DOT_FILLED).toBe('●');
    expect(DOT_EMPTY).toBe('·');
  });

  it('两个点阵字符显示宽度都是 1 列（不会让 bar 错位）', () => {
    expect(DOT_FILLED.length).toBe(1);
    expect(DOT_EMPTY.length).toBe(1);
  });

  it('铺的点数远大于任何可能的侧边栏宽度，保证裁剪后仍填满', () => {
    expect(BAR_DOTS).toBeGreaterThanOrEqual(200);
  });
});

describe('供应商名与窗口标签左边缘对齐', () => {
  it('色条前缀恰好占 LABEL_WIDTH 列', () => {
    expect(LABEL_WIDTH).toBe(2);
    expect(displayWidth(providerMark('▌'))).toBe(LABEL_WIDTH);
  });

  it('色条 + 名字的起点 = 窗口标签列的终点（严格对齐）', () => {
    // providerMark 宽度 === 窗口标签 box 宽度 → 两列的边界重合
    expect(displayWidth(providerMark('▌'))).toBe(displayWidth('5h'));
    expect(displayWidth('周')).toBe(LABEL_WIDTH);
  });

  it('色条被截断时也不会超过 LABEL_WIDTH（防止长前缀撑破布局）', () => {
    expect(displayWidth(providerMark('████'))).toBeLessThanOrEqual(LABEL_WIDTH);
  });

  it('空色条（传空串）也补满宽度，对齐不依赖是否画色条', () => {
    expect(providerMark('')).toBe('  ');
    expect(displayWidth(providerMark(''))).toBe(LABEL_WIDTH);
  });
});
