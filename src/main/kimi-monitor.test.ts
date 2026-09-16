import { describe, it, expect } from 'vitest';
import { mapPhase, aggregateState, buildProjects, reconcile } from './kimi-monitor';
import type { RestSession } from '../shared/types/kimi';

describe('mapPhase', () => {
  it('把 running / tool_call 映射为思考中', () => {
    expect(mapPhase({ kind: 'running' })).toBe('thinking');
    expect(mapPhase({ kind: 'tool_call' })).toBe('thinking');
  });

  it('streaming 按 stream 区分思考流与正文流', () => {
    expect(mapPhase({ kind: 'streaming', stream: 'thinking' })).toBe('thinking');
    expect(mapPhase({ kind: 'streaming', stream: 'content' })).toBe('editing');
    expect(mapPhase({ kind: 'streaming' })).toBe('editing');
  });

  it('结束类 phase 返回 null（不影响忙态）', () => {
    expect(mapPhase({ kind: 'idle' })).toBeNull();
    expect(mapPhase({ kind: 'done' })).toBeNull();
    expect(mapPhase({ kind: 'completed' })).toBeNull();
    expect(mapPhase(null)).toBeNull();
    expect(mapPhase(undefined)).toBeNull();
  });

  it('未知 kind 返回 null 且不抛错', () => {
    expect(mapPhase({ kind: 'magic' })).toBeNull();
  });
});

describe('aggregateState', () => {
  it('优先级：待审核 > 编辑中 > 思考中 > 空闲', () => {
    expect(aggregateState(['thinking'])).toBe('thinking');
    expect(aggregateState(['editing'])).toBe('editing');
    expect(aggregateState(['approval', 'editing', 'thinking'])).toBe('approval');
    expect(aggregateState(['editing', 'thinking'])).toBe('editing');
    expect(aggregateState(['thinking', 'idle'])).toBe('thinking');
    expect(aggregateState([])).toBe('idle');
    expect(aggregateState(['idle'])).toBe('idle');
  });
});

function rest(partial: Partial<RestSession>): RestSession {
  return {
    id: 's1',
    busy: false,
    pending_interaction: 'none',
    ...partial,
  };
}

describe('buildProjects', () => {
  it('按 cwd 归并、用原始 cwd 作显示名、取最近 updated_at', () => {
    const projects = buildProjects(
      [
        rest({ id: 'a', metadata: { cwd: 'C:/work/App' }, updated_at: '2026-09-16T00:00:01.000Z' }),
        rest({ id: 'b', metadata: { cwd: 'C:/work/app' }, updated_at: '2026-09-16T00:00:02.000Z' }),
      ],
      new Map(),
      true, // win：大小写不敏感，两个目录应并成一行
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('App'); // 显示名保留原始大小写
    expect(projects[0].lastResponse).toBe(Date.parse('2026-09-16T00:00:02.000Z'));
  });

  it('busy 表叠加出目录行忙态，pending 语义驱动红点', () => {
    const busy = new Map<string, 'thinking' | 'editing' | 'approval' | 'idle'>();
    busy.set('a', 'approval');
    busy.set('b', 'editing');
    const projects = buildProjects(
      [
        rest({ id: 'a', metadata: { cwd: 'C:/x' }, pending_interaction: 'approval' }),
        rest({ id: 'b', metadata: { cwd: 'C:/y' } }),
      ],
      busy,
      false,
    );
    const a = projects.find((p) => p.name === 'x')!;
    const b = projects.find((p) => p.name === 'y')!;
    expect(a.state).toBe('approval');
    expect(a.pending).toBe(true);
    expect(b.state).toBe('editing');
    expect(b.pending).toBe(false);
  });

  it('无 cwd 的会话退化为 workspace_id 分组、标题作显示名', () => {
    const projects = buildProjects(
      [rest({ id: 'a', workspace_id: 'wd_foo_x', title: '会话 A' })],
      new Map(),
      false,
    );
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('会话 A');
    expect(projects[0].id).toBe('ws:wd_foo_x');
  });

  it('按 lastResponse 降序排序', () => {
    const projects = buildProjects(
      [
        rest({ id: 'a', metadata: { cwd: 'C:/old' }, updated_at: '2026-09-16T00:00:01.000Z' }),
        rest({ id: 'b', metadata: { cwd: 'C:/new' }, updated_at: '2026-09-16T09:00:00.000Z' }),
      ],
      new Map(),
      false,
    );
    expect(projects.map((p) => p.name)).toEqual(['new', 'old']);
  });
});

describe('reconcile', () => {
  it('用 REST 的 busy / pending_interaction 校准忙态表', () => {
    const busy = new Map<string, 'thinking' | 'editing' | 'approval' | 'idle'>();
    busy.set('a', 'thinking');
    const changed = reconcile(busy, [
      rest({ id: 'a', pending_interaction: 'approval' }), // 待审核
      rest({ id: 'b', busy: true }),                      // 忙 → 思考
      rest({ id: 'c', busy: false }),                     // 空闲 → 移除（本就不在表里）
    ]);
    expect(changed).toBe(true);
    expect(busy.get('a')).toBe('approval');
    expect(busy.get('b')).toBe('thinking');
    expect(busy.has('c')).toBe(false);
  });

  it('不覆盖 WS 已给出的更细状态（editing）', () => {
    const busy = new Map<string, 'thinking' | 'editing' | 'approval' | 'idle'>();
    busy.set('a', 'editing');
    reconcile(busy, [rest({ id: 'a', busy: true })]);
    expect(busy.get('a')).toBe('editing');
  });

  it('无变化时返回 false（供 publish 去抖）', () => {
    const busy = new Map<string, 'thinking' | 'editing' | 'approval' | 'idle'>();
    busy.set('a', 'thinking');
    const changed = reconcile(busy, [rest({ id: 'a', busy: true })]);
    expect(changed).toBe(false);
  });
});