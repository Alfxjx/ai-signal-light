// 五家 provider 共用的请求封装。
// 对应主进程里的 axios 实例（src/main/usage-monitor.ts:53-58）：
// 统一浏览器 UA、8 秒超时、非 2xx 也把 body 读回来交给调用方判断。

export const REQUEST_TIMEOUT_MS = 8000;

/** 浏览器风格 UA，避免被部分 API 当作 node 客户端拒绝 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 已经本地化过的失败原因，message 可直接渲染 */
export class UsageError extends Error {}

export interface HttpResponse {
  status: number;
  text: string;
}

export async function httpRequest(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { status: response.status, text: await response.text() };
  } catch (error) {
    if ((error as { name?: string } | null)?.name === 'AbortError') throw new UsageError('超时');
    throw new UsageError('网络错误');
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // 落到下面统一返回空对象
  }
  return {};
}

export function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
