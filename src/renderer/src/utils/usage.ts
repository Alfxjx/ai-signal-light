// 用量节奏（pace）计算：根据当前已用 %、重置时间、窗口总时长，判断消耗比平均快/慢/平均。

export type UsagePace = 'fast' | 'slow' | 'average' | null;

export interface UsagePaceResult {
  /** 当前节奏：快 / 慢 / 平均 / 无法计算 */
  pace: UsagePace;
  /** 当前已用 % 与期望平均 % 的差值；正数表示比平均快 */
  delta: number | null;
  /** 按均匀消耗计算，当前时刻期望已用 % */
  expectedPercent: number | null;
}

const DEFAULT_PACE_THRESHOLD = 5; // ±5% 视为正常波动
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 计算用量节奏。
 *
 * 思路：
 * - 窗口总时长 windowMs，剩余重置时间 remainingMs
 * - 已过去时长 elapsedMs = windowMs - remainingMs
 * - 若按均匀速度消耗，当前期望已用 % = elapsedMs / windowMs * 100
 * - 与真实已用 % 比较，delta > threshold 为 fast，delta < -threshold 为 slow
 *
 * @param usedPercent  当前已用百分比（0-100）
 * @param resetTimeMs  绝对重置时间戳（毫秒）
 * @param windowMs     窗口总时长（毫秒），如 5h/1w
 * @param nowMs        当前时间戳（毫秒）
 * @param threshold    判定快/慢的阈值（百分比点），默认 5
 */
export function calcUsagePace(
  usedPercent: number,
  resetTimeMs: number | null | undefined,
  windowMs: number,
  nowMs: number,
  threshold = DEFAULT_PACE_THRESHOLD
): UsagePaceResult {
  if (!resetTimeMs || windowMs <= 0) {
    return { pace: null, delta: null, expectedPercent: null };
  }

  const remainingMs = resetTimeMs - nowMs;
  // 剩余时间必须在 (0, windowMs) 之间才有意义；
  // 等于或超过窗口说明数据还没刷新，已经重置则无法判断。
  if (remainingMs <= 0 || remainingMs >= windowMs) {
    return { pace: null, delta: null, expectedPercent: null };
  }

  const elapsedMs = windowMs - remainingMs;
  const expectedPercent = (elapsedMs / windowMs) * 100;
  const delta = usedPercent - expectedPercent;

  if (delta > threshold) return { pace: 'fast', delta, expectedPercent };
  if (delta < -threshold) return { pace: 'slow', delta, expectedPercent };
  return { pace: 'average', delta, expectedPercent };
}

/** 根据 pace 返回展示文本：快 / 慢 / 均 / 空 */
export function paceText(pace: UsagePace): string {
  if (pace === 'fast') return '快';
  if (pace === 'slow') return '慢';
  if (pace === 'average') return '均';
  return '';
}

/** 根据 pace 返回箭头符号：↑ / ↓ / — / 空 */
export function paceArrow(pace: UsagePace): string {
  if (pace === 'fast') return '↑';
  if (pace === 'slow') return '↓';
  if (pace === 'average') return '—';
  return '';
}

/**
 * 推断 all plan（Kimi total）的窗口总时长。
 * Kimi 只返回 expireTime，没有直接给出周期长度；这里根据剩余时间做粗略推断：
 * - 剩余 ≤ 40 天，按 30 天月度窗口估算
 * - 剩余 > 40 天，按 365 天年度窗口估算
 * 返回 null 表示无法推断（已过期）。
 */
export function inferAllPlanWindowMs(resetTimeMs: number, nowMs: number): number | null {
  const remainingMs = resetTimeMs - nowMs;
  if (remainingMs <= 0) return null;
  if (remainingMs <= 40 * DAY_MS) return 30 * DAY_MS;
  return 365 * DAY_MS;
}
