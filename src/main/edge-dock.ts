/**
 * 主面板顶部吸附自动隐藏（top-edge-dock）
 *
 * 交互：拖到屏幕顶部松手 → 自动收起（只留 PEEK 像素）→ 鼠标划到触发带 → 自动滑出
 *       从展开态把窗口拖离顶部 → 退出吸附
 *
 * 本模块不 import electron，所有平台能力通过 DockHost 注入，方便单测。
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type DockState = 'free' | 'collapsed' | 'expanded';

export interface DockHost {
  /** 当前窗口 bounds */
  getBounds(): Rect;
  /** 移动窗口（只改 y，宽高保持） */
  setBounds(rect: Rect): void;
  /** 传入点所在显示器的 workArea */
  getWorkArea(point: Point): Rect;
  /** 全局光标坐标 */
  getCursor(): Point;
  /** 是否"忙"：主窗口已聚焦，或设置/QR 窗口开着 —— 忙的时候不收起 */
  isBusy(): boolean;
  /** 状态变更回调：持久化 dockedTop + 通知 renderer 画 handle */
  onStateChange(state: DockState): void;
  /**
   * 吸附动画：本模块已把窗口瞬移到目标位，补偿值 = 动画起点 y - 目标 y。
   * 渲染层应把内容 translateY(补偿值) 并过渡到 0，用 GPU 合成做顺滑滑动，
   * 避免主进程逐帧 setBounds 搬 OS 窗口造成的卡顿。
   */
  animate(compensationY: number): void;
}

/** 窗口顶边距 workArea 顶边 ≤ 此值 → 触发吸附 */
export const SNAP_THRESHOLD = 10;
/** 收起后留在屏内的高度（同时是 hover 触发带高度） */
export const PEEK = 5;
/** 松手后延迟收起，给用户反应时间 */
export const COLLAPSE_DELAY = 500;
/** 光标在触发带内连续停留多久才滑出（防误触） */
export const EXPAND_HOVER_DELAY = 120;
/** 光标离开窗口后延迟多久收起 */
export const COLLAPSE_AFTER_LEAVE = 600;
/** cursor 轮询周期（仅 docked 状态运行），导出供单测使用 */
export const POLL_INTERVAL = 120;
/** 收/放动画时长（渲染层 CSS transition 用同一时长） */
export const ANIM_MS = 180;
/** 触发带水平方向容差 */
const BAND_PAD_X = 4;
/** 触发带垂直方向容差 */
const BAND_PAD_Y = 2;
/** 判定"光标离开窗口"的容差 */
const LEAVE_PAD = 8;

/** 只保留有限数字，否则返回 fallback（防止 NaN 泄漏给 setBounds） */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

export class TopEdgeDock {
  private host: DockHost;
  private _state: DockState = 'free';
  /** 动画进行中：期间 host 触发的 move 事件必须忽略 */
  private _animating = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private animEndTimer: ReturnType<typeof setTimeout> | null = null;
  private collapseDelayTimer: ReturnType<typeof setTimeout> | null = null;
  /** 光标进入触发带 / 离开窗口的起始时刻，null 表示条件当前不满足 */
  private bandSince: number | null = null;
  private leftSince: number | null = null;

  constructor(host: DockHost) {
    this.host = host;
  }

  get state(): DockState {
    return this._state;
  }

  /** 是否正在做收/放动画（main.ts 用它决定要不要持久化 bounds） */
  get animating(): boolean {
    return this._animating;
  }

  /** 处于吸附态（收起或展开）—— 此时 bounds 由本模块托管，不应写进 config */
  get docked(): boolean {
    return this._state !== 'free';
  }

  /**
   * 启动。initialDocked = true 时（重启恢复）直接无动画收起。
   */
  start(initialDocked: boolean): void {
    if (!initialDocked) return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    // 先把窗口摆回展开位（贴 workArea 顶边），再瞬时收起
    this.host.setBounds({ ...b, y: finiteOr(wa.y, b.y) });
    this.applyCollapsed();
  }

  /** 停止托管（窗口隐藏/最小化/退出时调用），不改变 _state */
  stop(): void {
    this.clearTimers();
    this._animating = false;
  }

  /**
   * 拖动结束（move 事件 debounce 后）调用。
   * - free + 贴顶 → 进入吸附，延迟收起
   * - docked + 被拖离顶部 → 退出吸附
   */
  handleMoveSettled(): void {
    if (this._animating) return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    const nearTop = b.y - wa.y <= SNAP_THRESHOLD && b.y - wa.y >= -SNAP_THRESHOLD;

    if (this._state === 'free') {
      if (!nearTop) return;
      // 对齐到 workArea 顶边，再延迟收起
      this.setY(wa.y);
      this.setState('expanded');
      this.startPolling();
      this.scheduleCollapse();
      return;
    }

    // 已吸附：展开态被拖离顶部 → 退出吸附
    if (!nearTop) {
      this.undock();
    }
  }

  /** 退出吸附，回到自由状态 */
  undock(): void {
    this.clearTimers();
    this._animating = false;
    this.setState('free');
  }

  /**
   * 窗口高度被改变后（例如渲染层切换简略/完整模式）重新按当前状态摆位，
   * 否则收起态的 y 会因为 height 变化而错位。
   */
  reapply(): void {
    if (this._state === 'free' || this._animating) return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    const y = this._state === 'collapsed' ? wa.y - b.height + PEEK : wa.y;
    this.setY(y);
  }

  // ---------- 内部 ----------

  private setState(next: DockState): void {
    if (this._state === next) return;
    this._state = next;
    this.host.onStateChange(next);
  }

  /** 用当前 bounds 生成只改 y 的新 rect，并对 y 做有限性兜底 */
  private setY(y: number): void {
    const b = this.host.getBounds();
    if (!Number.isFinite(y)) {
      console.error('[edge-dock] 目标 y 非法，跳过 setBounds:', y, b, this._state);
      return;
    }
    this.host.setBounds({ x: b.x, y, width: b.width, height: b.height });
  }

  private workAreaOf(b: Rect): Rect {
    return this.host.getWorkArea({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.bandSince = null;
    this.leftSince = null;
    this.pollTimer = setInterval(() => this.tick(), POLL_INTERVAL);
  }

  private clearTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.animEndTimer) { clearTimeout(this.animEndTimer); this.animEndTimer = null; }
    if (this.collapseDelayTimer) { clearTimeout(this.collapseDelayTimer); this.collapseDelayTimer = null; }
    this.bandSince = null;
    this.leftSince = null;
  }

  private scheduleCollapse(): void {
    if (this.collapseDelayTimer) clearTimeout(this.collapseDelayTimer);
    this.collapseDelayTimer = setTimeout(() => {
      this.collapseDelayTimer = null;
      if (this._state === 'expanded') this.collapse();
    }, COLLAPSE_DELAY);
  }

  /** 轮询：collapsed 判 hover 进触发带，expanded 判光标离开 */
  private tick(): void {
    if (this._animating || this._state === 'free') return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    const c = this.host.getCursor();
    const now = Date.now();

    if (this._state === 'collapsed') {
      const inBand = c.x >= b.x - BAND_PAD_X && c.x <= b.x + b.width + BAND_PAD_X
        && c.y >= wa.y - BAND_PAD_Y && c.y <= wa.y + PEEK + BAND_PAD_Y;
      if (!inBand) { this.bandSince = null; return; }
      if (this.bandSince === null) this.bandSince = now;
      if (now - this.bandSince >= EXPAND_HOVER_DELAY) this.expand();
      return;
    }

    // expanded
    if (this.collapseDelayTimer) return; // 松手后的收起倒计时还在跑，别插手
    const inside = c.x >= b.x - LEAVE_PAD && c.x <= b.x + b.width + LEAVE_PAD
      && c.y >= b.y - LEAVE_PAD && c.y <= b.y + b.height + LEAVE_PAD;
    if (inside || this.host.isBusy()) { this.leftSince = null; return; }
    if (this.leftSince === null) this.leftSince = now;
    if (now - this.leftSince >= COLLAPSE_AFTER_LEAVE) this.collapse();
  }

  private collapse(): void {
    if (this._state !== 'expanded' || this._animating) return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    this.setState('collapsed');
    this.animateTo(b, wa.y - b.height + PEEK);
  }

  private expand(): void {
    if (this._state !== 'collapsed' || this._animating) return;
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    this.setState('expanded');
    this.animateTo(b, wa.y);
  }

  /** 无动画收起（启动恢复用） */
  private applyCollapsed(): void {
    const b = this.host.getBounds();
    const wa = this.workAreaOf(b);
    this.setY(wa.y - b.height + PEEK);
    this.setState('collapsed');
    this.startPolling();
  }

  /**
   * 吸附动画（方案A）：窗口**瞬移**到目标 y，同时把「动画起点 y - 目标 y」的补偿值
   * 交给渲染层，由渲染层用 CSS transform 从补偿值过渡到 0 做 GPU 合成动画。
   * 主进程不再逐帧 setBounds，避免每帧搬 OS 窗口 + backdrop-filter 重合成导致的卡顿。
   */
  private animateTo(from: Rect, targetY: number): void {
    // 补偿值 = 起点 y - 目标 y：窗口瞬移后，内容反向平移补偿，视觉上不跳变。
    const compensationY = from.y - targetY;
    if (!Number.isFinite(compensationY)) {
      console.error('[edge-dock] 动画补偿值非法，退回瞬移:', { fromY: from.y, targetY, compensationY, state: this._state });
      this.setY(targetY);
      return;
    }
    // 先置 animating（瞬移会触发 move，必须被屏蔽，否则会被当成用户拖离顶部而 undock）
    this._animating = true;
    this.setY(targetY);
    this.host.animate(compensationY);
    // 渲染层 CSS 动画时长后清零 animating，期间屏蔽 re-entrant collapse/expand
    if (this.animEndTimer) clearTimeout(this.animEndTimer);
    this.animEndTimer = setTimeout(() => {
      this.animEndTimer = null;
      this._animating = false;
    }, ANIM_MS + 40);
  }
}
