/* Codex Pet 播放器：一个 div + CSS background-position 逐帧播放，无 canvas。
 *
 * 图集契约（与 Codex 官方完全一致，社区宠物零转换直接用）：
 * - spritesheet.webp，8 列，每格 192x208，每一行一个动作；
 * - v1 共 9 行（1536x1872），v2 共 11 行（前 9 行相同，多出的环视行不消费）。
 *
 * 播放语义照抄 Codex 官方（codex-rs pets/model.rs + 桌面版默认事件）：
 * - idle 帧时长是预览表的 6 倍（官方低干扰降速），其余行与官方一致；
 * - 宿主状态：干活=running、等输入=waiting、完成=review、失败=failed；
 * - 一次性动作播完直接回基底循环（官方 fallback 语义）；
 * - 交互：hover → jumping；拖拽左/右 → running-left/right，上 → waving，下 → jumping；
 * - prefers-reduced-motion：静态显示 idle 第一帧（官方约定）。
 *
 * 与参考项目差异：本应用宠物在独立 Electron 窗口里，窗口即宠物格子大小，
 * 页面内定位/拖拽停放由主进程窗口拖动承担，这里只负责播放与交互动画。
 */

export type PetAction =
  | 'idle' | 'running-right' | 'running-left' | 'waving' | 'jumping'
  | 'failed' | 'waiting' | 'running' | 'review';

export type PetDragDir = 'left' | 'right' | 'up' | 'down';

export const PET_CELL_W = 192;
export const PET_CELL_H = 208;
export const PET_COLS = 8;

// 官方动画表：行号 + 每帧时长 ms
const STATES: Record<PetAction, { row: number; durations: number[] }> = {
  idle: { row: 0, durations: [1680, 660, 660, 840, 840, 1920] },
  'running-right': { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  'running-left': { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  waving: { row: 3, durations: [140, 140, 140, 280] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
};

// 活跃/等输入 = 忙（busy→idle 播 review）
const BUSY: PetAction[] = ['running', 'waiting'];

const HOVER_COOLDOWN_MS = 4000;
const HOVER_DWELL_MS = 300; // 悬停停留这么久才起跳
const DRAG_FREEZE_MS = 250;
const DRAG_FREEZE_POLL_MS = 120;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('spritesheet load failed: ' + src));
    im.src = src;
  });
}

export interface PetPlayerOptions {
  imageUrl: string;
  scale?: number;
  zIndex?: number;
}

export interface PetPlayer {
  el: HTMLElement;
  /** 宿主状态 → 宠物基底动作（idle/running/waiting/failed） */
  setStatus: (action: PetAction) => void;
  /** 进入/离开拖拽（拖拽中不切换基底，松手按最新状态恢复） */
  setDragging: (dragging: boolean) => void;
  /** 拖拽方向提交（左/右 → running-*，上 → waving，下 → jumping） */
  dragDirection: (dir: PetDragDir) => void;
  /** 拖拽移动回报：用于指针停顿冻结动画 */
  onDragMove: () => void;
  /** 播一条一次性动作链（自动接回基底），如落地跳 ['jumping'] */
  playChain: (names: PetAction[]) => void;
  destroy: () => void;
}

/**
 * 创建一只宠物播放器，挂到调用方提供的容器（el 填满父级）。
 */
export async function createPet(opts: PetPlayerOptions): Promise<PetPlayer> {
  const imageUrl = opts && opts.imageUrl;
  if (!imageUrl) throw new Error('createPet: imageUrl is required');
  const scale = Number.isFinite(opts?.scale) && (opts?.scale as number) > 0 ? (opts?.scale as number) : 1;
  const zIndex = Number.isFinite(opts?.zIndex) ? (opts?.zIndex as number) : 1;
  const viewW = PET_CELL_W * scale;
  const viewH = PET_CELL_H * scale;

  // 校验图集合规（CSS 背景按自然尺寸渲染，无需读取宽高参与绘制）
  const img = await loadImage(imageUrl);
  const rows = Math.floor(img.height / PET_CELL_H);
  if (img.width !== PET_CELL_W * PET_COLS || img.height % PET_CELL_H !== 0 || rows < 9) {
    throw new Error(`CodexRoamPet: unexpected atlas size ${img.width}x${img.height}`);
  }

  const reduced = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = document.createElement('div');
  el.className = 'codex-roam-pet';
  el.style.cssText =
    `position:absolute;inset:0;margin:0;padding:0;z-index:${zIndex};` +
    `width:${viewW}px;height:${viewH}px;` +
    `background-image:url("${imageUrl.replace(/"/g, '%22')}");background-repeat:no-repeat;` +
    `background-size:${PET_CELL_W * PET_COLS * scale}px auto;` +
    'image-rendering:pixelated;image-rendering:crisp-edges;' +
    'cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;';

  /* ---------- 播放核心：定时器逐帧改 background-position ---------- */

  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerActive = false;
  let frame = 0;
  let current: PetAction = 'idle';
  let loopCurrent = true;
  let base: PetAction = 'idle';
  let pending: PetAction[] = [];
  let frozen = false; // 失败：播完 failed 后定格灰显

  function showFrame(): void {
    const def = STATES[current];
    el.style.backgroundPosition = `${-frame * PET_CELL_W * scale}px ${-def.row * PET_CELL_H * scale}px`;
  }

  function scheduleNext(): void {
    if (timer) clearTimeout(timer);
    timerActive = false;
    if (reduced) return;
    if (frozen && current === base) return; // 定格在基底第一帧
    timerActive = true;
    timer = setTimeout(tick, STATES[current].durations[frame]);
  }

  function enter(name: PetAction, { loop = false }: { loop?: boolean } = {}): void {
    const def = STATES[name];
    if (!def) return;
    if (reduced && name !== 'idle') return;
    current = name;
    loopCurrent = loop;
    frame = 0;
    showFrame();
    scheduleNext();
  }

  function tick(): void {
    timerActive = false;
    // 拖拽中指针停顿：冻结在当前帧，轮询等待下一次移动
    if (dragging && performance.now() - dragLastMoveTs > DRAG_FREEZE_MS) {
      timerActive = true;
      timer = setTimeout(tick, DRAG_FREEZE_POLL_MS);
      return;
    }
    const def = STATES[current];
    frame += 1;
    if (frame >= def.durations.length) {
      if (loopCurrent) {
        frame = 0;
      } else if (pending.length > 0) {
        enter(pending.shift() as PetAction, { loop: false });
        return;
      } else if (dragging) {
        frame = def.durations.length - 1; // 拖拽中的竖直方向动作：定格等松手
        showFrame();
        return;
      } else {
        enter(base, { loop: true }); // 一次性动作播完，回基底
        return;
      }
    }
    showFrame();
    scheduleNext();
  }

  // 播一条一次性动作链（自动接回基底）
  function playChain(names: PetAction[]): void {
    pending = names.slice(1);
    enter(names[0], { loop: false });
  }

  /* ---------- 宿主状态联动 ---------- */

  let agentStatus: PetAction = 'idle';

  function setStatus(action: PetAction): void {
    const next = STATES[action] ? action : 'idle';
    if (next === agentStatus) return;
    const prevBusy = BUSY.includes(agentStatus);
    agentStatus = next;
    const dead = next === 'failed';
    el.classList.toggle('codex-roam-pet-dim', dead);
    frozen = dead;
    const prevBase = base;
    base = dead ? 'idle' : next;
    if (reduced || dragging) return; // 拖拽中不切换，松手后按最新状态恢复

    if (dead) {
      playChain(['failed']); // failed 播一遍 → 灰显定格
      return;
    }
    if (prevBusy && next === 'idle') {
      playChain(['review']); // 一轮工作完成：review 播一遍回 idle
      return;
    }
    // 基底没变且正在播基底：不打断（避免 thinking↔editing 抖动）
    if (base === prevBase && current === base && timerActive) return;
    pending = [];
    enter(base, { loop: true });
  }

  /* ---------- 交互：hover 起跳 + 拖拽方向动画（窗口拖动由主进程承担） ---------- */

  let dragging = false;
  let dragLastMoveTs = 0;
  let dragDir: PetDragDir | '' = '';
  let hoverCooldownUntil = 0;
  let hoverDwellTimer: ReturnType<typeof setTimeout> | null = null;

  function setDragging(d: boolean): void {
    dragging = d;
    dragLastMoveTs = performance.now();
    if (d) {
      el.classList.add('codex-roam-pet-held');
      el.style.cursor = 'grabbing';
    } else {
      el.classList.remove('codex-roam-pet-held');
      el.style.cursor = 'grab';
    }
  }

  function dragDirection(dir: PetDragDir): void {
    if (dir === dragDir || reduced) return;
    dragDir = dir;
    if (dir === 'left') enter('running-left', { loop: true });
    else if (dir === 'right') enter('running-right', { loop: true });
    else if (dir === 'up') enter('waving', { loop: false });
    else if (dir === 'down') enter('jumping', { loop: false });
  }

  function onDragMove(): void {
    dragLastMoveTs = performance.now();
  }

  function onPointerEnter(): void {
    if (reduced || dragging || frozen) return;
    if (Date.now() < hoverCooldownUntil) return;
    if (hoverDwellTimer) clearTimeout(hoverDwellTimer);
    hoverDwellTimer = setTimeout(() => {
      hoverDwellTimer = null;
      if (dragging) return;
      hoverCooldownUntil = Date.now() + HOVER_COOLDOWN_MS;
      playChain(['jumping']); // 官方：hover → jumping，播完直接回基底
    }, HOVER_DWELL_MS);
  }

  function onPointerLeave(): void {
    if (hoverDwellTimer) {
      clearTimeout(hoverDwellTimer);
      hoverDwellTimer = null;
    }
  }

  /* ---------- 启动与销毁 ---------- */

  el.addEventListener('pointerenter', onPointerEnter);
  el.addEventListener('pointerleave', onPointerLeave);

  if (reduced) {
    // 减弱动态：官方约定静态显示 idle 第一帧
    current = 'idle';
    frame = 0;
    showFrame();
  } else {
    enter(base, { loop: true }); // 官方无登场动作：直接进入 idle 基底
  }

  function destroy(): void {
    if (timer) clearTimeout(timer);
    if (hoverDwellTimer) clearTimeout(hoverDwellTimer);
    timerActive = false;
    el.removeEventListener('pointerenter', onPointerEnter);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.remove();
  }

  return { el, setStatus, setDragging, dragDirection, onDragMove, playChain, destroy };
}
