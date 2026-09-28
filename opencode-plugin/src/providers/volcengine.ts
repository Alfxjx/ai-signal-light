// 火山 Ark Coding Plan 额度。
// 鉴权优先级与主进程一致（src/main/usage-monitor.ts:398-501）：
//   AK/SK（官方 OpenAPI，长期有效）→ Cookie（控制台会话，约一周失效）。
// ⚠️ 与主进程的唯一差别：插件只读，不把服务端下发的 Set-Cookie 合并回 config.json
//    （避免与桌面应用互相覆盖），cookie 过期时直接显示「登录态已过期」。

import type { RawAppConfig, RawVolcengineConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';
import { buildVolcengineUrl, signVolcengineRequest } from './volcengine-sign';

const VOLCENGINE_API =
  'https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage';
const VOLCENGINE_OPEN_HOST = 'open.volcengineapi.com';
const VOLCENGINE_OPEN_REGION = 'cn-beijing';
const VOLCENGINE_OPEN_SERVICE = 'ark';

const LEVELS = [
  { level: 'session', label: '5h' as const },
  { level: 'weekly', label: '周' as const },
  { level: 'monthly', label: '月' as const },
];

/** "a=1; b=2" → { a: '1', b: '2' }，容忍空格与空片段 */
export function parseCookieJar(cookie: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of (cookie || '').split(';')) {
    const kv = part.trim();
    if (!kv) continue;
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return jar;
}

// QuotaUsage 每档只给 Percent(已用%) 与 Cap(上限) 与重置时间；
// 重置字段在两条通道上分别叫 ResetTimestamp / ResetTime，这里兼容两种。
export function mapVolcengineUsage(json: Record<string, unknown>): WindowView[] {
  const quota = ((json.Result as Record<string, unknown> | undefined)?.QuotaUsage as unknown[]) || [];
  return LEVELS.map(({ level, label }) => {
    const item = (quota as Array<Record<string, unknown>>).find((q) => q?.Level === level);
    const percent = Number(item?.Percent);
    const resetSec = Number(item?.ResetTimestamp ?? item?.ResetTime);
    return {
      label,
      percent: Math.max(0, Math.min(100, Math.round(percent || 0))),
      resetTime:
        Number.isFinite(resetSec) && resetSec > 0
          ? new Date(resetSec * 1000).toISOString()
          : null,
    };
  });
}

function apiErrorCode(json: Record<string, unknown>): string | null {
  const metadata = json.ResponseMetadata as Record<string, unknown> | undefined;
  const error = metadata?.Error as Record<string, unknown> | undefined;
  return error?.Code ? String(error.Code) : null;
}

/** AK/SK 通道：官方 OpenAPI + V4 签名。返回缺档时抛错，交由调用方回退 Cookie */
async function fetchByAksk(cfg: RawVolcengineConfig): Promise<WindowView[]> {
  const signed = signVolcengineRequest({
    method: 'GET',
    host: VOLCENGINE_OPEN_HOST,
    region: VOLCENGINE_OPEN_REGION,
    service: VOLCENGINE_OPEN_SERVICE,
    action: 'GetCodingPlanUsage',
    version: '2024-01-01',
    query: { Region: VOLCENGINE_OPEN_REGION },
    accessKey: (cfg.accessKey ?? '').trim(),
    secretKey: (cfg.secretKey ?? '').trim(),
    date: new Date(),
  });

  const res = await httpRequest(buildVolcengineUrl(VOLCENGINE_OPEN_HOST, signed.canonicalQuery), {
    headers: signed.headers,
  });
  const json = parseJsonObject(res.text);

  const errCode = apiErrorCode(json);
  if (errCode) throw new UsageError(`AK/SK 调用失败: ${errCode}`);
  if (res.status >= 400) throw new UsageError(`AK/SK 调用失败: HTTP ${res.status}`);

  const present = new Set(
    (((json.Result as Record<string, unknown> | undefined)?.QuotaUsage as Array<Record<string, unknown>>) || [])
      .map((q) => String(q?.Level)),
  );
  const missing = LEVELS.filter(({ level }) => !present.has(level));
  if (missing.length > 0) {
    // AK/SK 通道的档位可能少于控制台 Cookie 通道，此时回退而不是展示 0
    throw new UsageError(`AK/SK 响应缺少 ${missing.map((m) => m.level).join('/')} 档`);
  }
  return mapVolcengineUsage(json);
}

/** Cookie 通道：控制台内部网关，依赖登录态 */
async function fetchByCookie(cfg: RawVolcengineConfig): Promise<WindowView[]> {
  const res = await httpRequest(VOLCENGINE_API, {
    method: 'POST',
    headers: {
      ...BROWSER_HEADERS,
      Cookie: (cfg.cookie ?? '').trim(),
      'x-csrf-token': (cfg.csrfToken ?? '').trim(),
      'Content-Type': 'application/json',
      Origin: 'https://console.volcengine.com',
      Referer: 'https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan',
    },
  });
  const json = parseJsonObject(res.text);

  // 火山鉴权失败时返回 HTTP 200 + ResponseMetadata.Error（InvalidCSRFToken 等），
  // 因此不能只按 status 判断。
  const errCode = apiErrorCode(json);
  if (errCode) {
    if (/csrf|token/i.test(errCode)) throw new UsageError('x-csrf-token 已过期');
    if (/login|signature|access.?key|credential|auth|session/i.test(errCode)) throw new UsageError('登录态已过期');
    throw new UsageError(`API 错误: ${errCode}`);
  }
  if (res.status === 401 || res.status === 403) throw new UsageError('登录态已过期');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const quota = (json.Result as { QuotaUsage?: unknown } | undefined)?.QuotaUsage;
  if (!quota) throw new UsageError('响应缺少 QuotaUsage');
  return mapVolcengineUsage(json);
}

export async function fetchVolcengine(raw: RawAppConfig): Promise<WindowView[]> {
  const cfg = raw.volcengine;
  if (!cfg) throw new UsageError('no_token');

  const hasAksk = Boolean((cfg.accessKey ?? '').trim() && (cfg.secretKey ?? '').trim());
  if (hasAksk) {
    try {
      return await fetchByAksk(cfg);
    } catch {
      // AK/SK 不可用时回退 Cookie 通道
    }
  }

  if (!(cfg.cookie ?? '').trim() || !(cfg.csrfToken ?? '').trim()) throw new UsageError('no_token');
  return fetchByCookie(cfg);
}
