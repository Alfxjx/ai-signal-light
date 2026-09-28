// Kimi 用量：GET https://api.kimi.com/coding/v1/usages（Bearer sk-kimi-…）
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapKimiUsages / fetchKimi。

import type { RawAppConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const KIMI_API = 'https://api.kimi.com/coding/v1/usages';

export interface UsageMetric {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  resetTime: string | null;
}

export function calcPercent(used: number | string, limit: number | string): number {
  const u = Number(used) || 0;
  const l = Number(limit) || 0;
  if (l <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((u / l) * 100)));
}

// 新接口只给 7 天周期（usage）与 5 小时窗口（limits[0].detail）两档；
// totalQuota 恒为空对象，不渲染。
export function mapKimiUsages(json: Record<string, unknown>): { fiveHour: UsageMetric; weekly: UsageMetric } {
  const toMetric = (o: Record<string, unknown> | null | undefined): UsageMetric => {
    const limit = Number(o?.limit) || 0;
    const used = Number(o?.used) || 0;
    return {
      limit,
      used,
      remaining: Number(o?.remaining) || 0,
      percent: calcPercent(used, limit),
      resetTime: o?.resetTime ? String(o.resetTime) : null,
    };
  };
  const usage = (json.usage as Record<string, unknown>) || {};
  const limits = (json.limits as unknown[]) || [];
  const detail =
    ((limits[0] as Record<string, unknown> | undefined)?.detail as Record<string, unknown>) || undefined;
  return { fiveHour: toMetric(detail), weekly: toMetric(usage) };
}

export async function fetchKimi(raw: RawAppConfig): Promise<WindowView[]> {
  const token = (raw.kimi?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(KIMI_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const mapped = mapKimiUsages(parseJsonObject(res.text));
  return [
    { label: '5h', percent: mapped.fiveHour.percent, resetTime: mapped.fiveHour.resetTime },
    { label: '周', percent: mapped.weekly.percent, resetTime: mapped.weekly.resetTime },
  ];
}
