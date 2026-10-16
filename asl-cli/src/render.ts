import chalk from 'chalk';
import {
  clamp,
  displayWidth,
  errorLabel,
  formatCountdown,
  formatMoney,
  formatPercent,
  levelFor,
  padToWidth,
  type Level,
  type ProviderState,
  type Thresholds,
} from 'providers-core';

export interface RenderOptions {
  configPath: string;
  thresholds: Thresholds;
  /** 相对 ms 转绝对用；测试注入固定值保证确定性 */
  now: number;
  /** 默认 false 输出纯文本；true 时按阈值上色 */
  color?: boolean;
}

const BAR_WIDTH = 16;

export function bar(percent: number, width: number = BAR_WIDTH): string {
  const filled = Math.round((clamp(percent) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function paint(level: Level, color: boolean): (text: string) => string {
  if (!color) return (text) => text;
  if (level === 'danger') return chalk.red;
  if (level === 'warn') return chalk.yellow;
  return chalk.green;
}

export function renderUsage(states: ProviderState[], opts: RenderOptions): string {
  const color = opts.color ?? false;
  const lines: string[] = [];
  lines.push(`AI 状态监控 CLI — config: ${opts.configPath}`);
  lines.push('');

  const nameWidth = Math.max(...states.map((s) => displayWidth(s.name)), 4);
  for (const state of states) {
    const nameCol = padToWidth(state.name, nameWidth);
    if (state.error) {
      lines.push(color ? chalk.grey(`${nameCol}  ${errorLabel(state.error)}`) : `${nameCol}  ${errorLabel(state.error)}`);
      continue;
    }
    if (state.balance) {
      lines.push(`${nameCol}  余额 ${formatMoney(state.balance.currency, state.balance.total)}`);
      continue;
    }
    if (state.windows.length === 0) {
      lines.push(`${nameCol}  （无窗口数据）`);
      continue;
    }
    state.windows.forEach((w, i) => {
      const labelCol = i === 0 ? nameCol : ' '.repeat(nameWidth);
      const level = levelFor(w.percent, opts.thresholds);
      const paintText = paint(level, color);
      const countdown = formatCountdown(w.resetTime, opts.now);
      const suffix = countdown ? `${countdown} 后重置` : '';
      const dimSuffix = color && suffix ? chalk.dim(suffix) : suffix;
      lines.push(
        `${labelCol}  ${padToWidth(w.label, 2)}  ${paintText(`[${bar(w.percent)}]`)}  ${paintText(formatPercent(w.percent))}  ${dimSuffix}`,
      );
    });
  }
  return lines.join('\n');
}
