<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useUsageState } from './composables/useUsageState';
import { createPet, type PetAction, type PetDragDir, type PetPlayer } from './pet/pet-sprites';
import type { KimiAggregateState } from './types/messages';

const { kimiState } = useUsageState();

// 宿主 Kimi 聚合状态 → 宠物基底动作（待审核=等输入 / 思考·编辑=干活 / 空闲=待着 / 离线=灰显定格）
const KIMI_TO_PET: Record<KimiAggregateState, PetAction> = {
  thinking: 'running',
  editing: 'running',
  approval: 'waiting',
  idle: 'idle',
  offline: 'failed',
};

const petMount = ref<HTMLElement | null>(null);
const hasPet = ref(false);

let player: PetPlayer | null = null;
let scale = 100;

async function loadPet(): Promise<void> {
  if (!window.electronAPI?.pet) return;
  try {
    const r = await window.electronAPI.pet.get();
    scale = r.scale;
    if (player) {
      player.destroy();
      player = null;
    }
    if (!r.pet || !petMount.value) {
      hasPet.value = false;
      return;
    }
    player = await createPet({ imageUrl: r.pet.dataUrl, scale: scale / 100 });
    petMount.value.appendChild(player.el);
    hasPet.value = true;
    player.setStatus(KIMI_TO_PET[kimiState.value] ?? 'idle');
  } catch (e) {
    console.error('[PetView] 加载宠物失败:', e);
    hasPet.value = false;
  }
}

watch(kimiState, (s) => {
  if (player) player.setStatus(KIMI_TO_PET[s] ?? 'idle');
});

/* ===== 三态交互：单击=打开 Kimi Web / 长按=弹下拉 / 拖动=移动窗口 ===== */

const LONG_PRESS_MS = 600;
const CLICK_DISTANCE = 4;
const DRAG_START_DISTANCE = 4;
const DRAG_COMMIT_PX = 12; // 与播放器磁滞阈值一致

let downX = 0;
let downY = 0;
let downTs = 0;
let downValid = false;
let moved = false;
let dragged = false;
let suppressClick = false;
let longPressTimer: number | null = null;
let dragAccumX = 0;
let dragAccumY = 0;

function cancelLongPress(): void {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function onMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  downX = e.screenX;
  downY = e.screenY;
  downTs = Date.now();
  downValid = true;
  moved = false;
  dragged = false;
  suppressClick = false;
  dragAccumX = 0;
  dragAccumY = 0;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp, { once: true });
  longPressTimer = window.setTimeout(onLongPress, LONG_PRESS_MS);
}

function onMouseMove(e: MouseEvent): void {
  if (!downValid) return;
  const dx = e.screenX - downX;
  const dy = e.screenY - downY;
  if (dx === 0 && dy === 0) return;
  moved = true;
  if (!dragged && Math.abs(dx) + Math.abs(dy) >= DRAG_START_DISTANCE) {
    // 超过点击阈值：取消长按，进入拖动
    cancelLongPress();
    dragged = true;
    player?.setDragging(true);
  }
  if (dragged) {
    window.electronAPI?.pet?.moveBy(dx, dy);
    player?.onDragMove();
    // 方向提交（磁滞防抖，与播放器一致）
    dragAccumX += dx;
    dragAccumY += dy;
    if (Math.abs(dragAccumX) >= DRAG_COMMIT_PX || Math.abs(dragAccumY) >= DRAG_COMMIT_PX) {
      const dir: PetDragDir = Math.abs(dragAccumX) >= Math.abs(dragAccumY)
        ? (dragAccumX < 0 ? 'left' : 'right')
        : (dragAccumY < 0 ? 'up' : 'down');
      dragAccumX = 0;
      dragAccumY = 0;
      player?.dragDirection(dir);
    }
  }
  downX = e.screenX;
  downY = e.screenY;
}

function onLongPress(): void {
  longPressTimer = null;
  if (!downValid || moved || dragged) return;
  suppressClick = true;
  window.electronAPI?.pet?.toggleDropdown();
}

function onMouseUp(e: MouseEvent): void {
  if (!downValid) return;
  downValid = false;
  window.removeEventListener('mousemove', onMouseMove);
  cancelLongPress();
  const dx = Math.abs(e.screenX - downX);
  const dy = Math.abs(e.screenY - downY);
  const dt = Date.now() - downTs;
  if (dragged) {
    player?.setDragging(false);
    player?.playChain(['jumping']); // 落地跳一下，之后按最新状态回基底
    return;
  }
  if (!suppressClick && !moved && dx <= CLICK_DISTANCE && dy <= CLICK_DISTANCE && dt <= LONG_PRESS_MS) {
    // 单击 → 打开本地 Kimi Code Web
    window.electronAPI?.pet?.openWeb();
  }
}

function onContextMenu(): void {
  cancelLongPress();
  window.electronAPI?.pet?.showMenu();
}

function openSettings(): void {
  cancelLongPress();
  window.electronAPI?.openSettings();
}

onMounted(async () => {
  await loadPet();
  window.electronAPI?.pet?.onChanged(() => {
    void loadPet();
  });
});

onBeforeUnmount(() => {
  cancelLongPress();
  if (player) {
    player.destroy();
    player = null;
  }
});
</script>

<template>
  <div class="pet-stage" @mousedown="onMouseDown" @contextmenu.prevent="onContextMenu">
    <!-- 播放器挂载点：与 Vue 管理的占位提示分离，避免 patch 误删手动插入的图集节点 -->
    <div class="pet-mount" ref="petMount"></div>
    <div v-if="!hasPet" class="pet-empty" @mousedown.stop @click="openSettings">
      尚未安装宠物<br><span>点击前往设置导入</span>
    </div>
  </div>
</template>
