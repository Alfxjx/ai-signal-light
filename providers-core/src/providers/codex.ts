// Codex 用量：凭证不走 config.json，而是直接读本机 Codex CLI 的 ~/.codex/auth.json
// （auth_mode=chatgpt 时 tokens.access_token 为 JWT，约 6 天有效），过期走
// auth.openai.com 的 refresh_token grant 刷新并合并写回（与 CLI 自身行为一致）。
// 逻辑移植自 src/main/codex-credentials.ts 与 usage-monitor.ts 的 fetchCodex / mapWhamUsage。
// 注意：这里是插件里唯一会写文件的 provider —— 写的是 Codex CLI 自己的 auth.json
// （桌面应用也做同样的刷新写回，tmp+rename 原子写，与 CLI/桌面互相兼容）。

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RawAppConfig } from '../config';
import type { WindowView } from '../types';
import { BROWSER_HEADERS, httpRequest, parseJsonObject, UsageError } from './http';

const CODEX_USAGE_API = 'https://chatgpt.com/backend-api/wham/usage';
/** Codex CLI 的公开 OAuth client_id */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
/** access_token 剩余有效期不足该值时提前刷新 */
const EXPIRY_BUFFER_SEC = 600;

export interface CodexAuthFile {
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  accessTokenExp: number | null;
}

export function codexAuthPath(): string {
  return join(homedir(), '.codex', 'auth.json');
}

export function decodeExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** 解析 auth.json 内容（纯函数） */
export function parseCodexAuthFile(raw: string): CodexAuthFile | null {
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const tokens = json.tokens as Record<string, unknown> | undefined;
    if (!tokens || typeof tokens.access_token !== 'string' || !tokens.access_token) return null;
    if (typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) return null;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accountId: typeof tokens.account_id === 'string' ? tokens.account_id : null,
      accessTokenExp: decodeExp(tokens.access_token),
    };
  } catch {
    return null;
  }
}

export function isCodexTokenValid(
  exp: number | null,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  return exp !== null && exp > nowSec + EXPIRY_BUFFER_SEC;
}

function readCodexAuthFile(): CodexAuthFile | null {
  try {
    const p = codexAuthPath();
    if (!existsSync(p)) return null;
    return parseCodexAuthFile(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 刷新并合并写回 auth.json（保留 auth_mode 等其他字段；原子写） */
async function refreshCodexAuth(file: CodexAuthFile): Promise<CodexAuthFile> {
  const res = await httpRequest(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: file.refreshToken,
    }),
  });
  const data = parseJsonObject(res.text);
  if (res.status >= 400 || typeof data.access_token !== 'string') {
    throw new UsageError('Codex 登录态刷新失败');
  }
  const p = codexAuthPath();
  const original = parseJsonObject(readFileSync(p, 'utf8'));
  const tokens = (original.tokens as Record<string, unknown>) || {};
  tokens.access_token = data.access_token;
  if (typeof data.refresh_token === 'string') tokens.refresh_token = data.refresh_token;
  if (typeof data.id_token === 'string') tokens.id_token = data.id_token;
  original.tokens = tokens;
  original.last_refresh = new Date().toISOString();
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(original, null, 2), 'utf8');
  renameSync(tmp, p);
  return {
    accessToken: data.access_token,
    refreshToken: tokens.refresh_token as string,
    accountId: file.accountId,
    accessTokenExp: decodeExp(data.access_token),
  };
}

/** 获取可用凭证：access_token 未过期直接用，过期自动刷新；无本地登录或刷新失败返回 null */
export async function getCodexAuth(): Promise<{ accessToken: string; accountId: string | null } | null> {
  const file = readCodexAuthFile();
  if (!file) return null;
  if (isCodexTokenValid(file.accessTokenExp)) {
    return { accessToken: file.accessToken, accountId: file.accountId };
  }
  try {
    const next = await refreshCodexAuth(file);
    return { accessToken: next.accessToken, accountId: next.accountId };
  } catch {
    return null;
  }
}

interface CodexWindow {
  usedPercent: number;
  resetAt: number | null;
}

/** wham/usage 响应映射（纯函数，与桌面端 mapWhamUsage 一致） */
export function mapWhamUsage(json: Record<string, unknown>): { primary: CodexWindow | null; secondary: CodexWindow | null } {
  const rl = (json?.rate_limit as Record<string, unknown>) || {};
  const mapWindow = (w: unknown): CodexWindow | null => {
    if (!w || typeof w !== 'object') return null;
    const o = w as Record<string, unknown>;
    return {
      usedPercent: Math.max(0, Math.min(100, Number(o.used_percent) || 0)),
      resetAt: typeof o.reset_at === 'number' ? o.reset_at : null,
    };
  };
  return { primary: mapWindow(rl.primary_window), secondary: mapWindow(rl.secondary_window) };
}

function toWindowView(label: WindowView['label'], w: CodexWindow | null): WindowView | null {
  if (!w) return null;
  return {
    label,
    percent: Math.round(w.usedPercent),
    // reset_at 是秒级时间戳 → ISO 绝对时间字符串（与火山同一约定，规避 format.toEpochMs 的相对/绝对启发式误判）
    resetTime: w.resetAt ? new Date(w.resetAt * 1000).toISOString() : null,
  };
}

export async function fetchCodex(_raw: RawAppConfig): Promise<WindowView[]> {
  const auth = await getCodexAuth();
  // Codex 没有 config.json 里的 token 概念，本地未登录 Codex CLI 即视为「未配置」
  if (!auth) throw new UsageError('no_token');

  const headers: Record<string, string> = {
    ...BROWSER_HEADERS,
    Authorization: `Bearer ${auth.accessToken}`,
  };
  if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;

  const res = await httpRequest(CODEX_USAGE_API, { headers });
  if (res.status === 401 || res.status === 403) throw new UsageError('鉴权失败');
  if (res.status >= 400) throw new UsageError(`HTTP ${res.status}`);

  const mapped = mapWhamUsage(parseJsonObject(res.text));
  return [
    toWindowView('5h', mapped.primary),
    toWindowView('周', mapped.secondary),
  ].filter((w): w is WindowView => w !== null);
}
