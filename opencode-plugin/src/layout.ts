// 纯布局决策层：决定「画哪些块、每块什么颜色、什么顺序、每列多宽」。
//
// 只对**点阵进度条本身的宽度**不预设（交给 yoga + overflow 裁剪），其余列宽
// （标签 / 百分比 / 倒计时）都按本轮数据的真实最大位数算成固定值 —— 这样
// `18%` 和 `100%` 天然对齐，且完全不依赖侧边栏有多宽。

import type { Thresholds } from './config';
import type { ProviderState } from './types';
import {
  errorLabel,
  formatCountdown,
  formatFreshness,
  formatMoney,
  formatPercent,
  levelFor,
  padLeft,
  padToWidth,
  pickPrimary,
} from './format';
import type { Level } from './format';

export type { Level };

/**
 * 折叠 / 展开的三角指示符。字形与 `opencode-tokenwatch` 保持一致，
 * 免得两个侧边栏插件在同一屏里指示符长得不一样。
 */
export const COLLAPSED_GLYPH = '▶';
export const EXPANDED_GLYPH = '▾';

/**
 * 表头里的「刷新」按钮字形，紧跟在「用量」文字后面，点击立即重新拉取（见 tui.tsx）。
 * 它不参与任何列对齐，只是贴在标题右侧的一个可点热区，所以不必像色条那样按
 * 显示宽度补齐（`⟳` 属于 East-Asian Ambiguous，换字体会差 1 列，但不影响对齐）。
 */
export const REFRESH_GLYPH = '⟳';

/**
 * 点阵进度条的字符。填充用实心圆点、空槽用中点 —— 比实心色块轻，
 * 深色主题下不会糊成一片，且都是单宽字符（不会错位）。
 */
export const DOT_FILLED = '●';
export const DOT_EMPTY = '·';

/** 画一次铺满整条 bar；实际可见几个由父盒裁剪决定，只要够长即可 */
export const BAR_DOTS = 256;

/**
 * 窗口标签列宽（`5h` / `周` / `月` 都是 2 显示列）。
 * 供应商名前的竖色条也补齐到这个宽度，于是「供应商名」和「窗口标签」左边缘对齐。
 */
export const LABEL_WIDTH = 2;

export type RenderedBlock =
  | { kind: 'header'; left: string; refresh: string; right: string; collapsed: boolean }
  | { kind: 'providerHead'; name: string; level: Level }
  | {
      kind: 'window';
      label: string;
      percent: number;
      /** 已按列宽右对齐补齐；它的长度就是这一列的宽度 */
      percentText: string;
      resetText: string;
      level: Level;
    }
  | { kind: 'balance'; name: string; amount: string; level: Level }
  | { kind: 'note'; text: string; level: Level };

export interface LayoutInput {
  updatedAt: number | null;
  configError: string | null;
  thresholds: Thresholds;
  providers: ProviderState[];
  now: number;
  /** 折叠时只出表头 + 一行摘要 */
  collapsed: boolean;
}

/**
 * 供应商名前缀：竖色条右侧补空格，**整体恰好占 LABEL_WIDTH 列**。
 *
 * 不能靠「色条 + 手打一个空格」凑 —— `▌` 的实际宽度取决于终端字体
 * （U+258C 属于 East-Asian Ambiguous），字体不同就错位。这里用显示宽度
 * 显式补齐，并配一个 box 锁死宽度，双保险。
 */
export function providerMark(mark: string): string {
  return padToWidth(mark, LABEL_WIDTH);
}

/** 百分比列宽：取本轮所有窗口里最宽的（`5%` 3 列 vs `100%` 4 列） */export function percentColumnWidth(providers: ProviderState[]): number {
  let widest = 0;
  for (const state of providers) {
    for (const w of state.windows) {
      widest = Math.max(widest, formatPercent(w.percent).length);
    }
  }
  return Math.max(3, widest);
}

/** 倒计时列宽：同样按本轮真实最大值（`12d` 比 `2d` 宽 1 列）；全为空则 0 */
export function resetColumnWidth(providers: ProviderState[], now: number): number {
  let widest = 0;
  for (const state of providers) {
    for (const w of state.windows) {
      const text = formatCountdown(w.resetTime, now);
      if (text) widest = Math.max(widest, text.length);
    }
  }
  return widest;
}

/** 一家 provider → 若干块。出错 / 余额 / 百分比三种形态各走各的分支。 */
function providerBlocks(
  state: ProviderState,
  thresholds: Thresholds,
  now: number,
  percentWidth: number,
  resetWidth: number,
): RenderedBlock[] {
  if (state.error) {
    return [
      { kind: 'note', text: `${state.name}  － ${errorLabel(state.error)}`, level: state.error === 'no_token' ? 'muted' : 'danger' },
    ];
  }

  if (state.balance) {
    return [
      { kind: 'balance', name: state.name, amount: formatMoney(state.balance.currency, state.balance.total), level: 'fresh' },
    ];
  }

  const tightest = pickPrimary(state.windows);
  const headLevel: Level = tightest ? levelFor(tightest.percent, thresholds) : 'muted';
  if (state.windows.length === 0) {
    return [{ kind: 'providerHead', name: `${state.name}  －`, level: headLevel }];
  }

  const blocks: RenderedBlock[] = [{ kind: 'providerHead', name: state.name, level: headLevel }];
  for (const w of state.windows) {
    // 两列都右对齐到固定列宽，右边缘连成一条直线
    const reset = formatCountdown(w.resetTime, now);
    blocks.push({
      kind: 'window',
      label: w.label,
      percent: w.percent,
      percentText: padLeft(formatPercent(w.percent), percentWidth),
      resetText: reset ? padLeft(reset, resetWidth) : '',
      level: levelFor(w.percent, thresholds),
    });
  }
  return blocks;
}

export function layoutPlan(input: LayoutInput): RenderedBlock[] {
  const { updatedAt, configError, thresholds, providers, now, collapsed } = input;

  const header: RenderedBlock = {
    kind: 'header',
    left: `${collapsed ? COLLAPSED_GLYPH : EXPANDED_GLYPH} 用量`,
    refresh: REFRESH_GLYPH,
    right: formatFreshness(updatedAt, now),
    collapsed,
  };

  // 折叠就是「整个侧边栏只剩表头一行」。曾经试过在下面加一行「最紧的一家」摘要，
  // 但那一行长得太像 provider 行，用户会读成「这家没被收进去」—— 干脆不给。
  if (collapsed) return [header];

  const blocks: RenderedBlock[] = [header];

  if (configError) {
    blocks.push({ kind: 'note', text: configError, level: 'danger' });
  }

  const percentWidth = percentColumnWidth(providers);
  const resetWidth = resetColumnWidth(providers, now);
  for (const state of providers) {
    blocks.push(...providerBlocks(state, thresholds, now, percentWidth, resetWidth));
  }

  return blocks;
}
