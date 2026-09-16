import { describe, it, expect } from 'vitest';
import { filterRecentProjects, RECENT_WINDOW_MS } from './kimiFilter';
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