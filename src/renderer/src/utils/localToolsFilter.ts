// 本地 Agent 工具的项目裁剪规则（纯函数，便于测试）。
// 与 kimiFilter 对齐：主面板只保留「当前还在忙」或「今天（本地自然日）动过」的项目。

import type { LocalToolProject } from '../types/messages';
import { startOfDay } from './kimiFilter';

/**
 * 过滤出 Agent 卡片要展示的项目行（对齐 filterTodayProjects）：
 * - phase 非 idle（思考/编辑）：正在跑 → 强留（时间戳过期也不能藏正在干活的目录）
 * - lastActive 落在 now 所在的本地自然日之内 → 保留
 * - 其余（今天之前就空闲的目录）→ 隐藏
 */
export function filterTodayLocalProjects(projects: LocalToolProject[], now: number): LocalToolProject[] {
  const dayStart = startOfDay(now);
  return projects.filter((p) => {
    if (p.phase !== 'idle') return true;
    if (p.lastActive != null && p.lastActive >= dayStart) return true;
    return false;
  });
}
