/**
 * Codex CLI 本地凭证读取与刷新
 * 凭证位于 ~/.codex/auth.json（auth_mode=chatgpt 时 tokens.access_token 为 JWT，约 6 天有效）
 * 过期时走 auth.openai.com 的 refresh_token grant 刷新并合并写回（与 CLI 自身行为一致）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import axios, { AxiosProxyConfig } from 'axios';

export interface CodexAuth {
  accessToken: string;
  accountId: string | null;
}

/** Codex CLI 的公开 OAuth client_id */
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const REQUEST_TIMEOUT_MS = 8000;
/** access_token 剩余有效期不足该值时提前刷新 */
const EXPIRY_BUFFER_SEC = 600;

interface CodexAuthFile {
  accessToken: string;
  refreshToken: string;
  accountId: string | null;
  accessTokenExp: number | null;
}

export function codexAuthPath(): string {
  return path.join(os.homedir(), '.codex', 'auth.json');
}

function decodeExp(token: string): number | null {
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
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  return exp !== null && exp > nowSec + EXPIRY_BUFFER_SEC;
}

function readCodexAuthFile(): CodexAuthFile | null {
  try {
    const p = codexAuthPath();
    if (!fs.existsSync(p)) return null;
    return parseCodexAuthFile(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 本地是否存在可用的 Codex 登录（不要求 token 未过期，过期可刷新） */
export function codexAuthAvailable(): boolean {
  return readCodexAuthFile() !== null;
}

/** 刷新并合并写回 auth.json（保留 auth_mode 等其他字段；原子写） */
async function refreshCodexAuth(file: CodexAuthFile, proxyConfig: AxiosProxyConfig | null): Promise<CodexAuthFile> {
  const res = await axios.post(
    OPENAI_TOKEN_URL,
    { client_id: CODEX_CLIENT_ID, grant_type: 'refresh_token', refresh_token: file.refreshToken },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
    }
  );
  const data = res.data as Record<string, unknown>;
  if (!data || typeof data.access_token !== 'string') {
    throw new Error(`codex refresh failed: HTTP ${res.status}`);
  }
  const p = codexAuthPath();
  const original = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  const tokens = (original.tokens as Record<string, unknown>) || {};
  tokens.access_token = data.access_token;
  if (typeof data.refresh_token === 'string') tokens.refresh_token = data.refresh_token;
  if (typeof data.id_token === 'string') tokens.id_token = data.id_token;
  original.tokens = tokens;
  original.last_refresh = new Date().toISOString();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(original, null, 2), 'utf8');
  fs.renameSync(tmp, p);
  return {
    accessToken: data.access_token,
    refreshToken: tokens.refresh_token as string,
    accountId: file.accountId,
    accessTokenExp: decodeExp(data.access_token),
  };
}

/**
 * 获取可用的 Codex 凭证：access_token 未过期直接用，过期自动刷新。
 * 无本地登录或刷新失败返回 null。
 */
export async function getCodexAuth(proxyConfig: AxiosProxyConfig | null): Promise<CodexAuth | null> {
  const file = readCodexAuthFile();
  if (!file) return null;
  if (isCodexTokenValid(file.accessTokenExp)) {
    return { accessToken: file.accessToken, accountId: file.accountId };
  }
  try {
    const next = await refreshCodexAuth(file, proxyConfig);
    console.log('[usage:codex] local credentials refreshed');
    return { accessToken: next.accessToken, accountId: next.accountId };
  } catch (e) {
    console.warn('[usage:codex] refresh local credentials failed:', (e as Error).message);
    return null;
  }
}
