/**
 * GitHub Copilot Device Flow 认证与用量查询
 * 流程：github.com/login/device/code 拿 user_code → 用户浏览器确认 →
 * 轮询 login/oauth/access_token 拿 gho_ OAuth token（长期有效，存入配置）→
 * 用 OAuth token 换 copilot_internal 会话 token → 查 copilot_internal/user 的 quota_snapshots
 */

import axios, { AxiosProxyConfig } from 'axios';
import type { CopilotUsageData } from '../shared/types/usage';

/** copilot.vim / copilot.lua 共用的公开 OAuth client_id */
export const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_USER_URL = 'https://api.github.com/copilot_internal/user';
const REQUEST_TIMEOUT_MS = 8000;
/** 会话 token 过期前提前刷新的缓冲 */
const SESSION_EXPIRY_BUFFER_MS = 60_000;

const GITHUB_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'ai-status-monitor',
};

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** 服务端要求的轮询间隔（秒） */
  interval: number;
  expiresIn: number;
}

/** 判断 copilot.token 字段里存的是不是 OAuth token（否则按旧 Cookie 处理） */
export function isCopilotOAuthToken(token: string): boolean {
  return token.startsWith('gho_') || token.startsWith('ghu_');
}

function axiosConfig(proxyConfig: AxiosProxyConfig | null) {
  return {
    headers: { ...GITHUB_HEADERS },
    timeout: REQUEST_TIMEOUT_MS,
    ...(proxyConfig ? { proxy: proxyConfig } : {}),
  };
}

/** 第一步：申请设备码 */
export async function startDeviceFlow(proxyConfig: AxiosProxyConfig | null): Promise<DeviceCodeInfo> {
  const res = await axios.post(
    DEVICE_CODE_URL,
    new URLSearchParams({ client_id: COPILOT_CLIENT_ID, scope: 'read:user' }).toString(),
    axiosConfig(proxyConfig)
  );
  const data = res.data as Record<string, unknown>;
  if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
    throw new Error(`device code request failed: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: String(data.verification_uri || 'https://github.com/login/device'),
    interval: Number(data.interval) || 5,
    expiresIn: Number(data.expires_in) || 900,
  };
}

/** 第二步：轮询换取 OAuth token。shouldCancel 返回 true 时中止。 */
export async function pollDeviceFlow(
  info: DeviceCodeInfo,
  proxyConfig: AxiosProxyConfig | null,
  shouldCancel: () => boolean
): Promise<string> {
  const deadline = Date.now() + info.expiresIn * 1000;
  let intervalMs = info.interval * 1000;

  while (Date.now() < deadline) {
    if (shouldCancel()) throw new Error('cancelled');
    await new Promise(r => setTimeout(r, intervalMs));

    const res = await axios.post(
      ACCESS_TOKEN_URL,
      new URLSearchParams({
        client_id: COPILOT_CLIENT_ID,
        device_code: info.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
      axiosConfig(proxyConfig)
    );
    const data = res.data as Record<string, unknown>;
    if (typeof data.access_token === 'string') return data.access_token;

    switch (data.error) {
      case 'authorization_pending': continue;
      case 'slow_down': intervalMs += 5000; continue;
      case 'expired_token': throw new Error('授权码已过期，请重新发起');
      case 'access_denied': throw new Error('用户拒绝了授权');
      default: throw new Error(`授权失败: ${String(data.error_description || data.error || 'unknown')}`);
    }
  }
  throw new Error('授权超时，请重新发起');
}

/** 第三步（缓存）：OAuth token → copilot_internal 会话 token */
export class CopilotSessionCache {
  private token: string | null = null;
  private expiresAtMs = 0;

  async getSessionToken(githubToken: string, proxyConfig: AxiosProxyConfig | null): Promise<string> {
    if (this.token && Date.now() < this.expiresAtMs - SESSION_EXPIRY_BUFFER_MS) {
      return this.token;
    }
    const res = await axios.get(COPILOT_TOKEN_URL, {
      ...axiosConfig(proxyConfig),
      headers: { ...GITHUB_HEADERS, 'Authorization': `token ${githubToken}` },
    });
    const data = res.data as Record<string, unknown>;
    if (typeof data.token !== 'string') {
      throw new Error(`copilot session token failed: HTTP ${res.status}`);
    }
    this.token = data.token;
    this.expiresAtMs = typeof data.expires_at === 'string'
      ? Date.parse(data.expires_at)
      : Date.now() + 25 * 60 * 1000;
    return this.token;
  }

  clear(): void {
    this.token = null;
    this.expiresAtMs = 0;
  }
}

/** 第四步：会话 token → quota_snapshots */
export async function fetchCopilotUser(sessionToken: string, proxyConfig: AxiosProxyConfig | null): Promise<CopilotUsageData> {
  const res = await axios.get(COPILOT_USER_URL, {
    ...axiosConfig(proxyConfig),
    headers: { ...GITHUB_HEADERS, 'Authorization': `Bearer ${sessionToken}` },
  });
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data || {}).slice(0, 200)}`);
  }
  const json = res.data as Record<string, unknown>;
  if (!json || typeof json !== 'object' || !json.quota_snapshots) {
    throw new Error('invalid response, oauth token may lack copilot access');
  }
  return mapCopilotUserResponse(json);
}

// 本地 percent 计算（与 usage-monitor.calcPercent 同语义；内联以避免模块循环引用）
function percentUsed(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

/** 纯函数：copilot_internal/user 响应 → CopilotUsageData（percent 语义为已用 %） */
export function mapCopilotUserResponse(json: Record<string, unknown>): CopilotUsageData {
  const qs = (json.quota_snapshots as Record<string, unknown>) || {};
  const premium = (qs.premium_interactions as Record<string, unknown>) || {};
  const chat = (qs.chat as Record<string, unknown>) || {};

  const entitlement = Number(premium.entitlement) || 0;
  const remaining = Number(premium.remaining) || 0;
  const chatPercentRemaining = Number(chat.percent_remaining);

  return {
    premium: {
      limit: entitlement,
      remaining,
      percent: percentUsed(entitlement - remaining, entitlement),
      resetDate: json.quota_reset_date ? String(json.quota_reset_date) : null,
      resetDateUtc: json.quota_reset_date_utc ? String(json.quota_reset_date_utc) : null,
    },
    chat: { percent: Number.isFinite(chatPercentRemaining) ? Math.max(0, Math.min(100, 100 - chatPercentRemaining)) : 0 },
    plan: json.copilot_plan ? String(json.copilot_plan) : null,
    licenseType: json.access_type_sku ? String(json.access_type_sku) : null,
  };
}
