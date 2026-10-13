import { describe, it, expect } from 'vitest';
import type { LocalToolProject } from '../types/messages';
import { filterTodayLocalProjects } from './localToolsFilter';

function proj(over: Partial<LocalToolProject>): LocalToolProject {
  return { id: 'x', name: 'x', cwd: null, title: null, phase: 'idle', lastActive: null, ...over };
}

describe('filterTodayLocalProjects', () => {
  const now = Date.parse('2026-10-13T15:00:00+08:00'); // 本地 10-13

  it('非 idle（思考/编辑）强留，即使不是当日', () => {
    const projects = [proj({ phase: 'thinking', lastActive: Date.parse('2026-10-10T10:00:00+08:00') })];
    expect(filterTodayLocalProjects(projects, now)).toHaveLength(1);
  });

  it('idle 且当日动过 → 保留', () => {
    const projects = [proj({ phase: 'idle', lastActive: Date.parse('2026-10-13T09:00:00+08:00') })];
    expect(filterTodayLocalProjects(projects, now)).toHaveLength(1);
  });

  it('idle 且今天之前 → 隐藏', () => {
    const projects = [proj({ phase: 'idle', lastActive: Date.parse('2026-10-12T23:00:00+08:00') })];
    expect(filterTodayLocalProjects(projects, now)).toHaveLength(0);
  });

  it('无时间戳的 idle → 隐藏', () => {
    expect(filterTodayLocalProjects([proj({ phase: 'idle', lastActive: null })], now)).toHaveLength(0);
  });
});
