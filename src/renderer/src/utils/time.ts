// 纯函数：时间格式化与颜色分级。吃 now 参数以便测试和保持响应式。

export function formatAge(ts: number | string | null | undefined, now: number): string {
  if (!ts) return '—';
  const diff = now - new Date(ts).getTime();
  if (diff < 0) return 'just now';
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ageClass(ts: number | string | null | undefined, now: number): string {
  if (!ts) return 'age-stale';
  const diff = now - new Date(ts).getTime();
  if (diff < 5 * 60 * 1000) return 'age-fresh';
  if (diff < 60 * 60 * 1000) return 'age-warn';
  return 'age-stale';
}

// usage bar 颜色阈值（按"已用 %"分级：越多越危险）
// thresholds 由用户在设置窗口配置；默认 { warn: 50, danger: 80 }
export function barClass(
  usedPercent: number,
  thresholds: { warn: number; danger: number }
): string {
  if (usedPercent > thresholds.danger) return 'danger';
  if (usedPercent > thresholds.warn)   return 'warn';
  return '';
}

// 把相对毫秒数格式化为 XdYhZm（用于 MiniMax 的 remaining ms）
function formatDuration(ms: number): string {
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.ceil((ms % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || (days > 0 && mins > 0)) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join('');
}

// "Reset in ..." —— isDuration=true 表示 ts 是相对毫秒数；否则优先当绝对时间解析
export function formatResetTime(ts: number | string | null | undefined, isDuration = false): string {
  if (ts === null || ts === undefined || ts === '') return '';
  if (isDuration) {
    const ms = Number(ts);
    if (Number.isNaN(ms)) return '';
    const text = formatDuration(ms);
    return text ? `Reset in ${text}` : '';
  }
  const d = new Date(ts);
  const now = new Date();
  if (Number.isNaN(d.getTime()) || d < now) return '';
  const text = formatDuration(d.getTime() - now.getTime());
  return text ? `Reset in ${text}` : '';
}
