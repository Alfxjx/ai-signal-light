import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TopEdgeDock,
  PEEK,
  SNAP_THRESHOLD,
  COLLAPSE_DELAY,
  EXPAND_HOVER_DELAY,
  COLLAPSE_AFTER_LEAVE,
  ANIM_MS,
  POLL_INTERVAL,
  type DockHost,
  type DockState,
  type Rect,
  type Point
} from './edge-dock';

const WA: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const W = 240;
const H = 550;

function makeHost(initial: Partial<Rect> = {}) {
  let bounds: Rect = { x: 800, y: 300, width: W, height: H, ...initial };
  let cursor: Point = { x: 0, y: 999 };
  let busy = false;
  const states: DockState[] = [];
  const anims: number[] = [];

  const host: DockHost = {
    getBounds: () => ({ ...bounds }),
    setBounds: (r) => { bounds = { ...r }; },
    getWorkArea: () => ({ ...WA }),
    getCursor: () => ({ ...cursor }),
    isBusy: () => busy,
    onStateChange: (s) => { states.push(s); },
    animate: (compensationY) => { anims.push(compensationY); }
  };

  return {
    host,
    states,
    anims,
    get bounds() { return bounds; },
    setBounds: (r: Partial<Rect>) => { bounds = { ...bounds, ...r }; },
    setCursor: (p: Point) => { cursor = p; },
    setBusy: (v: boolean) => { busy = v; }
  };
}

/** 收起态的目标 y */
const collapsedY = WA.y - H + PEEK;

describe('TopEdgeDock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('松手时贴顶 → 对齐顶边、延迟后收起', () => {
    const h = makeHost({ y: WA.y + SNAP_THRESHOLD - 2 });
    const dock = new TopEdgeDock(h.host);

    dock.handleMoveSettled();
    expect(dock.state).toBe('expanded');
    expect(h.bounds.y).toBe(WA.y); // 立即对齐

    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);
    expect(dock.state).toBe('collapsed');
    expect(h.bounds.y).toBe(collapsedY);
    expect(h.states).toEqual(['expanded', 'collapsed']);
    dock.stop();
  });

  it('松手时离顶部太远 → 保持 free，不动窗口', () => {
    const h = makeHost({ y: WA.y + SNAP_THRESHOLD + 30 });
    const dock = new TopEdgeDock(h.host);

    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 500);

    expect(dock.state).toBe('free');
    expect(h.bounds.y).toBe(WA.y + SNAP_THRESHOLD + 30);
    expect(h.states).toEqual([]);
  });

  it('收起态下光标进触发带 → 停留够久后滑出到顶边', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);
    expect(dock.state).toBe('collapsed');

    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 1 });
    vi.advanceTimersByTime(POLL_INTERVAL + EXPAND_HOVER_DELAY + ANIM_MS + 50);

    expect(dock.state).toBe('expanded');
    expect(h.bounds.y).toBe(WA.y);
    dock.stop();
  });

  it('收起态下光标只是水平/垂直擦过触发带外侧 → 不滑出', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);

    // x 越界
    h.setCursor({ x: h.bounds.x - 100, y: WA.y + 1 });
    vi.advanceTimersByTime(EXPAND_HOVER_DELAY * 3);
    expect(dock.state).toBe('collapsed');

    // y 越界（低于触发带下沿）
    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + PEEK + 40 });
    vi.advanceTimersByTime(EXPAND_HOVER_DELAY * 3);
    expect(dock.state).toBe('collapsed');
    dock.stop();
  });

  it('展开态下光标离开窗口 → 延迟后重新收起', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);
    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 1 });
    vi.advanceTimersByTime(POLL_INTERVAL + EXPAND_HOVER_DELAY + ANIM_MS + 50);
    expect(dock.state).toBe('expanded');

    // 光标停在窗口里 → 不收
    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 100 });
    vi.advanceTimersByTime(COLLAPSE_AFTER_LEAVE * 2);
    expect(dock.state).toBe('expanded');

    // 移开 → 收起
    h.setCursor({ x: h.bounds.x + W + 200, y: WA.y + 400 });
    vi.advanceTimersByTime(POLL_INTERVAL + COLLAPSE_AFTER_LEAVE + ANIM_MS + 50);
    expect(dock.state).toBe('collapsed');
    expect(h.bounds.y).toBe(collapsedY);
    dock.stop();
  });

  it('展开态 + isBusy（设置窗口开着 / 面板聚焦）→ 光标移开也不收起', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);
    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 1 });
    vi.advanceTimersByTime(POLL_INTERVAL + EXPAND_HOVER_DELAY + ANIM_MS + 50);

    h.setBusy(true);
    h.setCursor({ x: 1900, y: 1000 });
    vi.advanceTimersByTime(COLLAPSE_AFTER_LEAVE * 3);
    expect(dock.state).toBe('expanded');

    h.setBusy(false);
    vi.advanceTimersByTime(POLL_INTERVAL + COLLAPSE_AFTER_LEAVE + ANIM_MS + 50);
    expect(dock.state).toBe('collapsed');
    dock.stop();
  });

  it('吸附后被拖离顶部 → 退出吸附，之后不再托管窗口位置', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    dock.handleMoveSettled();
    vi.advanceTimersByTime(COLLAPSE_DELAY + ANIM_MS + 50);
    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 1 });
    vi.advanceTimersByTime(POLL_INTERVAL + EXPAND_HOVER_DELAY + ANIM_MS + 50);
    expect(dock.state).toBe('expanded');

    // 用户把窗口拖到屏幕中间
    h.setBounds({ y: 500 });
    dock.handleMoveSettled();
    expect(dock.state).toBe('free');

    // 轮询已停：光标随便放，y 不再被改写
    h.setCursor({ x: 1900, y: 1000 });
    vi.advanceTimersByTime(COLLAPSE_AFTER_LEAVE * 5);
    expect(h.bounds.y).toBe(500);
  });

  it('start(true) 恢复收起态：无动画直接收起并开始轮询', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);

    dock.start(true);
    expect(dock.state).toBe('collapsed');
    expect(h.bounds.y).toBe(collapsedY);

    h.setCursor({ x: h.bounds.x + W / 2, y: WA.y + 1 });
    vi.advanceTimersByTime(POLL_INTERVAL + EXPAND_HOVER_DELAY + ANIM_MS + 50);
    expect(dock.state).toBe('expanded');
    dock.stop();
  });

  it('start(false) 不做任何事', () => {
    const h = makeHost({ y: 300 });
    const dock = new TopEdgeDock(h.host);
    dock.start(false);
    expect(dock.state).toBe('free');
    expect(h.bounds.y).toBe(300);
  });

  it('docked getter 反映是否由本模块托管 bounds', () => {
    const h = makeHost({ y: WA.y + 3 });
    const dock = new TopEdgeDock(h.host);
    expect(dock.docked).toBe(false);
    dock.handleMoveSettled();
    expect(dock.docked).toBe(true);
    dock.undock();
    expect(dock.docked).toBe(false);
  });
});
