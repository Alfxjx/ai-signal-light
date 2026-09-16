<script setup lang="ts">
import { computed } from 'vue';
import { useUsageState } from './composables/useUsageState';
import type { KimiAggregateState } from './types/messages';

const { kimiState, kimiAvailable } = useUsageState();

// 窗口不再用 -webkit-app-region: drag（drag 区会吞点击事件，且与"点击弹下拉"互斥）。
// 改为自绘拖动：mousedown 记录起点，mousemove 通过 IPC moveBy 移动窗口，
// 移动距离小且时间短视为点击（弹下拉），否则视为拖动。
const CLICK_DISTANCE = 4;   // px
const CLICK_DURATION = 300; // ms
let downX = 0;
let downY = 0;
let downTs = 0;
let downValid = false;
let moved = false;

function onMouseDown(e: MouseEvent) {
  downX = e.screenX;
  downY = e.screenY;
  downTs = Date.now();
  downValid = true;
  moved = false;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp, { once: true });
}

function onMouseMove(e: MouseEvent) {
  if (!downValid) return;
  const dx = e.screenX - downX;
  const dy = e.screenY - downY;
  if (dx !== 0 || dy !== 0) {
    moved = true;
    window.electronAPI?.floatingBall?.moveBy(dx, dy);
    downX = e.screenX;
    downY = e.screenY;
  }
}

function onMouseUp(e: MouseEvent) {
  if (!downValid) return;
  downValid = false;
  window.removeEventListener('mousemove', onMouseMove);
  const dx = Math.abs(e.screenX - downX);
  const dy = Math.abs(e.screenY - downY);
  const dt = Date.now() - downTs;
  // 仅当没有实际拖动才算点击
  if (!moved && dx <= CLICK_DISTANCE && dy <= CLICK_DISTANCE && dt <= CLICK_DURATION) {
    onBallClick();
  }
}

function onBallClick() {
  if (window.electronAPI?.floatingBall?.toggleDropdown) {
    window.electronAPI.floatingBall.toggleDropdown().catch((e: unknown) => {
      console.error('[FloatingBall] toggleDropdown failed:', e);
    });
  } else {
    console.log('[FloatingBall] click → toggle dropdown (mock)');
  }
}

// LED 状态类：待审核=红闪 / 编辑=黄常亮 / 思考=黄呼吸 / 空闲=绿微光 / 离线=灰灭
const ledStateClass = computed<string>(() => {
  if (!kimiAvailable.value) return 'offline';
  return kimiState.value;
});

const STATE_TEXT: Record<KimiAggregateState, string> = {
  approval: '待审核',
  editing: '编辑中',
  thinking: '思考中',
  idle: '空闲',
  offline: '离线',
};
const ledTitle = computed(() => `Kimi · ${STATE_TEXT[kimiState.value]}`);
</script>

<template>
  <div class="fb" :title="ledTitle">
    <!-- 拟物化像素 LED 圆灯：可点击弹下拉，按住拖动整个球 -->
    <div class="led" :class="`led--${ledStateClass}`"
         @mousedown="onMouseDown">
      <div class="led-lens"></div>
    </div>
  </div>
</template>