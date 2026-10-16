import type { WindowView } from './types';

export type Level = 'fresh' | 'warn' | 'danger' | 'muted';

/** 小于 365 天的数字视为「距重置的相对毫秒」（沿用 useUsageState.ts:46 的启发式） */
const MAX_RELATIVE_MS = 365 * 24 * 60 * 60 * 1000;

const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$' };

/** 终端显示宽度：CJK / 全角算 2 列 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += isWide(ch) ? 2 : 1;
  return width;
}

function isWide(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return '';
  if (displayWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const w = isWide(ch) ? 2 : 1;
    if (used + w > width - 1) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

export function padToWidth(text: string, width: number): string {
  const trimmed = truncateToWidth(text, width);
  const gap = width - displayWidth(trimmed);
  return gap > 0 ? trimmed + ' '.repeat(gap) : trimmed;
}

/** 左补齐（右对齐用）。数字列必须右对齐，否则位数一变整列就跳 */
export function padLeft(text: string, width: number): string {
  const trimmed = truncateToWidth(text, width);
  const gap = width - displayWidth(trimmed);
  return gap > 0 ? ' '.repeat(gap) + trimmed : trimmed;
}

export function clamp(percent: number): number {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// 百分比恒被 clamp 到 0-100，所以最多 3 位数字，不需要千分位分隔。
export function formatPercent(percent: number): string {
  return `${Math.round(clamp(percent))}%`;
}

/** 阈值判定与 useUsageState.ts:134 一致：严格大于 */
export function levelFor(percent: number, thresholds: { warn: number; danger: number }): Level {
  const p = clamp(percent);
  if (p > thresholds.danger) return 'danger';
  if (p > thresholds.warn) return 'warn';
  return 'fresh';
}

function toEpochMs(resetTime: string | null, now: number): number | null {
  if (!resetTime) return null;
  const n = Number(resetTime);
  if (Number.isFinite(n) && n > 0) {
    return n < MAX_RELATIVE_MS ? now + n : n;
  }
  const parsed = Date.parse(resetTime);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 倒计时只保留最大单位（窄栏用）：'2d' / '3h' / '30m'，已过期返回空串 */
export function formatCountdown(resetTime: string | null, now: number): string {
  const target = toEpochMs(resetTime, now);
  if (target === null) return '';
  const ms = target - now;
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

export function formatMoney(currency: string | null, amount: number): string {
  const symbol = CURRENCY_SYMBOL[(currency ?? 'CNY').toUpperCase()] ?? '';
  const value = Number.isFinite(amount) ? amount : 0;
  return `${symbol}${value.toFixed(2)}`;
}

export function errorLabel(error: string): string {
  return error === 'no_token' ? '未配置' : error;
}

/** 取已用 % 最大的窗口（并列时保留靠前的）。用于给「每家的标题行」着色 */
export function pickPrimary(windows: WindowView[]): WindowView | null {
  let best: WindowView | null = null;
  for (const w of windows) {
    if (!best || clamp(w.percent) > clamp(best.percent)) best = w;
  }
  return best;
}

/** 表头右侧的新鲜度（不含「用量」前缀）—— 前缀与它之间由 flex 弹性空间撑开 */
export function formatFreshness(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return '拉取中…';
  const mins = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}m 前`;
  return `${Math.floor(mins / 60)}h 前`;
}

