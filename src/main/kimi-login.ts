/**
 * Kimi 内嵌登录窗口
 * 打开 kimi.com，拦截 apiv2 请求的 Authorization 头抓取网页会话 token（user-center 签发的 JWT，约 30 天有效）。
 * 会话 cookie 持久化在 persist:kimi-login 分区，token 过期后重开窗口通常无需重新登录即可抓到新 token。
 */

import { BrowserWindow } from 'electron';

const KIMI_HOME = 'https://www.kimi.com';
const API_FILTER = { urls: ['https://www.kimi.com/apiv2/*'] };
const SESSION_PARTITION = 'persist:kimi-login';

let loginWindow: BrowserWindow | null = null;

/** 解码 JWT 的 exp（秒级 Unix 时间戳），非法 token 返回 null */
export function decodeJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * 打开（或聚焦）Kimi 登录窗口。
 * onToken：抓到未过期 token 时回调（可能多次，调用方自行决定去重/关窗）
 * onClose：窗口关闭时回调（无论是否抓到 token）
 */
export function openKimiLoginWindow(
  parent: BrowserWindow | null,
  onToken: (token: string) => void,
  onClose: () => void
): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus();
    return;
  }
  loginWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    parent: parent ?? undefined,
    autoHideMenuBar: true,
    title: '登录 Kimi 账号',
    webPreferences: { partition: SESSION_PARTITION },
  });

  const ses = loginWindow.webContents.session;
  ses.webRequest.onBeforeSendHeaders(API_FILTER, (details, callback) => {
    const headers = details.requestHeaders as Record<string, string>;
    const auth = headers['Authorization'] || headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      onToken(auth.slice('Bearer '.length).trim());
    }
    callback({ requestHeaders: headers });
  });

  loginWindow.on('closed', () => {
    loginWindow = null;
    onClose();
  });
  loginWindow.loadURL(KIMI_HOME).catch(() => {});
}

export function closeKimiLoginWindow(): void {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.close();
  }
}
