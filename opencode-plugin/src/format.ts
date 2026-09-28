import type { ProviderState, WindowView } from './types';

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

export function clamp(percent: number): number {
  const n = Number(percent);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** 5 格条形：█ 已用 / ░ 剩余，越宽 = 越接近上限 */
export function formatBar(percent: number, width = 5): string {
  const filled = Math.round((clamp(percent) / 100) * width);
  const head = Math.max(0, Math.min(width, filled));
  return '█'.repeat(head) + '░'.repeat(width - head);
}

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

/** 取已用 % 最大的窗口作为主数字（并列时保留靠前的） */
export function pickPrimary(windows: WindowView[]): WindowView | null {
  let best: WindowView | null = null;
  for (const w of windows) {
    if (!best || clamp(w.percent) > clamp(best.percent)) best = w;
  }
  return best;
}

export function formatHeader(updatedAt: number | null, now: number): string {
  if (updatedAt === null) return '用量  拉取中…';
  const mins = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  const age = mins < 1 ? '刚刚' : mins < 60 ? `${mins}m前` : `${Math.floor(mins / 60)}h前`;
  return `用量  刷新 ${age}`;
}

export function formatProviderLine(
  state: ProviderState,
  nameWidth: number,
  thresholds: { warn: number; danger: number },
  now: number,
): { text: string; level: Level } {
  const name = padToWidth(state.name, nameWidth);

  if (state.error) {
    const label = errorLabel(state.error);
    return { text: `${name} － ${label}`, level: state.error === 'no_token' ? 'muted' : 'danger' };
  }

  if (state.balance) {
    return { text: `${name} ${formatMoney(state.balance.currency, state.balance.total)}`, level: 'fresh' };
  }

  const main = pickPrimary(state.windows);
  if (!main) return { text: `${name} －`, level: 'muted' };

  const parts = [formatBar(main.percent), formatPercent(main.percent), main.label];
  const reset = formatCountdown(main.resetTime, now);
  if (reset) parts.push(reset);
  return { text: `${name} ${parts.join(' ')}`, level: levelFor(main.percent, thresholds) };
}
