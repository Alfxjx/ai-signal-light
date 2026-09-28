// MiniMax 用量：GET https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains
// ⚠️ 服务端给的是「剩余 %」，展示用的「已用 %」= 100 - remaining。
// 映射逻辑移植自 src/main/usage-monitor.ts 的 fetchMiniMax，语义对齐
// src/renderer/src/composables/useUsageState.ts:206。

import type { RawAppConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const MINIMAX_API = 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains';

function usedPercent(remaining: unknown): number {
  const p = 100 - (Number(remaining) || 0);
  return Math.max(0, Math.min(100, p));
}

export function mapMiniMax(json: Record<string, unknown>): { fiveHour: WindowView; weekly: WindowView } {
  const baseResp = json.base_resp as Record<string, unknown> | undefined;
  if (baseResp?.status_code !== 0) {
    throw new UsageError((baseResp?.status_msg as string) || 'API 错误');
  }

  const remains = (json.model_remains as Array<Record<string, unknown>>) || [];
  const general = remains.find((m) => m?.model_name === 'general');
  if (!general) throw new UsageError('响应缺少 general 档');

  return {
    fiveHour: {
      label: '5h',
      percent: usedPercent(general.current_interval_remaining_percent),
      resetTime: general.remains_time ? String(general.remains_time) : null,
    },
    weekly: {
      label: '周',
      percent: usedPercent(general.current_weekly_remaining_percent),
      resetTime: general.weekly_remains_time ? String(general.weekly_remains_time) : null,
    },
  };
}

export async function fetchMiniMax(raw: RawAppConfig): Promise<WindowView[]> {
  const token = (raw.minimax?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(MINIMAX_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const mapped = mapMiniMax(parseJsonObject(res.text));
  return [mapped.fiveHour, mapped.weekly];
}
