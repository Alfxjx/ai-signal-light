// MiMo 余额：GET https://platform.xiaomimimo.com/api/v1/balance
// 鉴权走控制台会话 Cookie（api-platform_serviceToken / userId 等），调模型的 sk- key 查不到余额。
// 映射逻辑移植自 src/main/usage-monitor.ts 的 mapMimoBalance —— 小米未公开响应结构，
// 故做两层容错：剥 data/result 信封 + 字段名「去下划线忽略大小写」匹配。

import type { RawAppConfig } from '../config';
import type { BalanceView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const MIMO_BALANCE_API = 'https://platform.xiaomimimo.com/api/v1/balance';

const MIMO_TOTAL_KEYS = [
  'totalBalance', 'balance', 'total', 'availableBalance',
  'usableBalance', 'remainBalance', 'remainingBalance', 'amount',
];
const MIMO_CURRENCY_KEYS = ['currency', 'currencyCode', 'curr'];
const MIMO_SCALE_KEYS = ['scale', 'unit', 'amountScale', 'precision'];

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 键名归一化：去掉 _ - 空白并转小写，让候选名能匹配多种命名风格 */
function normalizeKey(k: string): string {
  return k.replace(/[_\-\s]/g, '').toLowerCase();
}

function pickNumber(src: Record<string, unknown>, keys: string[]): number | null {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [k, v] of Object.entries(src)) {
    if (!wanted.has(normalizeKey(k))) continue;
    const n = toFiniteNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function pickString(src: Record<string, unknown>, keys: string[]): string | null {
  const wanted = new Set(keys.map(normalizeKey));
  for (const [k, v] of Object.entries(src)) {
    if (wanted.has(normalizeKey(k)) && typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

export function mapMimoBalance(json: Record<string, unknown>): BalanceView {
  // 剥信封：最多向下剥 3 层 data / result
  let payload: Record<string, unknown> = json;
  for (let i = 0; i < 3; i++) {
    const next = (payload.data ?? payload.result) as unknown;
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      payload = next as Record<string, unknown>;
    } else {
      break;
    }
  }
  // balance 可能是嵌套对象 { balance: { total, paid, granted } }，摊平后一起匹配
  const nested = payload.balance;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    payload = { ...payload, ...(nested as Record<string, unknown>) };
  }

  const rawTotal = pickNumber(payload, MIMO_TOTAL_KEYS);
  if (rawTotal === null) throw new UsageError('响应缺少余额字段');

  const scale = pickNumber(payload, MIMO_SCALE_KEYS);
  const div = scale !== null && scale > 1 ? scale : 1;

  return {
    currency: pickString(payload, MIMO_CURRENCY_KEYS) ?? 'CNY',
    total: Math.round((rawTotal / div) * 100) / 100,
  };
}

export async function fetchMimo(raw: RawAppConfig): Promise<BalanceView> {
  const cookie = (raw.mimo?.token ?? '').trim();
  if (!cookie) throw new UsageError('no_token');

  const res = await httpRequest(MIMO_BALANCE_API, {
    headers: {
      ...BROWSER_HEADERS,
      Cookie: cookie,
      Origin: 'https://platform.xiaomimimo.com',
      Referer: 'https://platform.xiaomimimo.com/#/console/balance',
    },
  });

  if (res.status === 401 || res.status === 403) throw new UsageError('登录态已过期');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const json = parseJsonObject(res.text);
  try {
    return mapMimoBalance(json);
  } catch (error) {
    // 控制台也可能用 HTTP 200 + code/message 表达失败
    const message = typeof json.message === 'string' ? json.message
      : typeof json.msg === 'string' ? json.msg : '';
    if (json.loginUrl || /login|auth|token|unauthor|expire|session|未登录|登录/i.test(message)) {
      throw new UsageError('登录态已过期');
    }
    throw error;
  }
}
