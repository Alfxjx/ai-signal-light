import { describe, it, expect } from 'vitest';
import { filterRecentProjects, filterTodayProjects, startOfDay, RECENT_WINDOW_MS } from './kimiFilter';
import type { KimiProject } from '../types/messages';

const now = Date.now();
function make(over: Partial<KimiProject>): KimiProject {
  return {
    id: 'x',
    name: 'x',
    cwd: null,
    lastResponse: null,
    state: 'idle',
    pending: false,
    ...over,
  };
}

/** now 减去 n 毫秒，但保证仍在同一自然日（用于"今天"用例） */
function earlierToday(nowTs: number, ms: number): number {
  const dayStart = startOfDay(nowTs);
  const delta = nowTs - dayStart;
  const safe = Math.min(ms, Math.max(delta - 1000, 0));
  return nowTs - safe;
}

describe('filterRecentProjects', () => {
  it('保留非空闲项目（思考/编辑/待审核）即使很久没动', () => {
    const list = [
      make({ id: 'a', state: 'editing', lastResponse: now - RECENT_WINDOW_MS - 1000 }),
      make({ id: 'b', state: 'approval', lastResponse: null }),
    ];
    const out = filterRecentProjects(list, now);
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('保留 3 天内动过的空闲项目', () => {
    const list = [
      make({ id: 'a', state: 'idle', lastResponse: now - 60_000 }),
      make({ id: 'b', state: 'idle', lastResponse: now - RECENT_WINDOW_MS }),
      make({ id: 'c', state: 'idle', lastResponse: now - RECENT_WINDOW_MS - 1 }),
    ];
    const out = filterRecentProjects(list, now);
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('隐藏空闲且很久没动的项目', () => {
    const list = [make({ id: 'a', state: 'idle', lastResponse: now - 10 * 24 * 60 * 60 * 1000 })];
    expect(filterRecentProjects(list, now)).toEqual([]);
  });

  it('保留 pending 项目', () => {
    const list = [make({ id: 'a', state: 'idle', pending: true, lastResponse: null })];
    expect(filterRecentProjects(list, now).map((p) => p.id)).toEqual(['a']);
  });

  it('保留顺序不变（沿用入参顺序）', () => {
    const list = [
      make({ id: 'z', state: 'idle', lastResponse: now - 1000 }),
      make({ id: 'y', state: 'thinking', lastResponse: null }),
    ];
    expect(filterRecentProjects(list, now).map((p) => p.id)).toEqual(['z', 'y']);
  });
});

describe('startOfDay', () => {
  it('返回本地自然日零点', () => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    expect(startOfDay(now)).toBe(d.getTime());
  });
});

describe('filterTodayProjects', () => {
  it('保留今天动过的空闲项目（含今天零点那一毫秒）', () => {
    const list = [
      make({ id: 'a', state: 'idle', lastResponse: now - 1000 }),
      make({ id: 'b', state: 'idle', lastResponse: startOfDay(now) }),
    ];
    expect(filterTodayProjects(list, now).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('隐藏今天之前空闲的项目（哪怕昨天刚动过）', () => {
    const list = [
      make({ id: 'old', state: 'idle', lastResponse: startOfDay(now) - 1 }),
      make({ id: 'ancient', state: 'idle', lastResponse: now - 10 * 24 * 60 * 60 * 1000 }),
    ];
    expect(filterTodayProjects(list, now)).toEqual([]);
  });

  it('强留正在忙 / 待确认的项目，即使时间戳不在今天', () => {
    const list = [
      make({ id: 'busy', state: 'editing', lastResponse: startOfDay(now) - 60_000 }),
      make({ id: 'thinking', state: 'thinking', lastResponse: null }),
      make({ id: 'pending', state: 'idle', pending: true, lastResponse: null }),
    ];
    expect(filterTodayProjects(list, now).map((p) => p.id)).toEqual(['busy', 'thinking', 'pending']);
  });

  it('隐藏既空闲又没有任何时间戳的项目', () => {
    expect(filterTodayProjects([make({ id: 'a', state: 'idle', lastResponse: null })], now)).toEqual([]);
  });

  it('只留今天一段活动之前的旧项目（今天 0 点到 now 之间的活动）', () => {
    const list = [
      make({ id: 'today', state: 'idle', lastResponse: earlierToday(now, 4 * 60 * 60 * 1000) }),
      make({ id: 'before', state: 'idle', lastResponse: startOfDay(now) - 1 }),
    ];
    expect(filterTodayProjects(list, now).map((p) => p.id)).toEqual(['today']);
  });

  it('保留顺序不变（沿用入参顺序，主进程已按时间倒序）', () => {
    const list = [
      make({ id: 'z', state: 'idle', lastResponse: now - 1000 }),
      make({ id: 'y', state: 'thinking', lastResponse: startOfDay(now) - 60_000 }),
    ];
    expect(filterTodayProjects(list, now).map((p) => p.id)).toEqual(['z', 'y']);
  });
});