// 下拉菜单的项目裁剪规则（纯函数，便于测试）。
// 需求：不要显示太多、尤其不要显示很早之前就没再动过的项目。
// 规则：保留「当前还在忙（非空闲）」或「3 天内有过活动」的项目，其余隐藏。

import type { KimiProject } from '../types/messages';

/** 最近活动窗口，默认 3 天 */
export const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 过滤出下拉菜单要展示的项目行。
 * - state !== 'idle'：当前非空闲（思考/编辑/待审核）→ 强留
 * - lastResponse 在 windowMs 内：3 天内动过 → 保留
 * - 其余（空闲且很久没动）→ 隐藏
 */
export function filterRecentProjects(
  projects: KimiProject[],
  now: number,
  windowMs: number = RECENT_WINDOW_MS,
): KimiProject[] {
  return projects.filter((p) => {
    if (p.state !== 'idle') return true;
    if (p.pending) return true;
    if (p.lastResponse != null && now - p.lastResponse <= windowMs) return true;
    return false;
  });
}