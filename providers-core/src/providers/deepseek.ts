// DeepSeek 余额：GET https://api.deepseek.com/user/balance（Bearer sk-…）
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapDeepseekBalance。

import type { RawAppConfig } from '../config';
import type { BalanceView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const DEEPSEEK_API = 'https://api.deepseek.com/user/balance';

export function mapDeepseekBalance(json: Record<string, unknown>): BalanceView {
  const infos = (json.balance_infos as unknown[]) || [];
  const first = infos[0] as Record<string, unknown> | undefined;
  if (!first) throw new UsageError('响应缺少余额字段');
  return {
    currency: first.currency ? String(first.currency) : null,
    total: parseFloat(String(first.total_balance)) || 0,
  };
}

export async function fetchDeepseek(raw: RawAppConfig): Promise<BalanceView> {
  const token = (raw.deepseek?.token ?? '').trim();
  if (!token) throw new UsageError('no_token');

  const res = await httpRequest(DEEPSEEK_API, {
    headers: { ...BROWSER_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  return mapDeepseekBalance(parseJsonObject(res.text));
}
