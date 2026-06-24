<script setup lang="ts">
import { computed } from 'vue';
import { useUsageState } from './composables/useUsageState';

// 整块是 -webkit-app-region: drag，所以普通 click 事件被 OS 消费。
// 改为监听 mousedown/mouseup：距离+时间短视为 click，长/移动视为 drag（已交给 OS）
const {
  kimiFiveHour,
  minimaxFiveHour,
  copilotSlot,
  isProviderVisible,
  pendingByCwd
} = useUsageState();

const kimiVisible = computed<boolean>(() => isProviderVisible('kimi'));
const minimaxVisible = computed<boolean>(() => isProviderVisible('minimax'));
const copilotVisible = computed<boolean>(() => isProviderVisible('copilot'));

const pendingCount = computed<number>(() => Object.keys(pendingByCwd).length);

// function basenameOf(p: string): string {
//   return p.split(/[\\/]/).filter(Boolean).pop() || p;
// }

// const projectName = computed<string>(() => {
//   const keys = Object.keys(pendingByCwd);
//   if (keys.length === 0) return '空闲';
//   if (keys.length === 1) return basenameOf(keys[0]);
//   return `${keys.length} 项待处理`;
// });

// ===== 短按 vs 拖动 判定 =====
const CLICK_DISTANCE = 4;   // px
const CLICK_DURATION = 300; // ms
let downX = 0;
let downY = 0;
let downTs = 0;
let downValid = false;

function onMouseDown(e: MouseEvent) {
  downX = e.clientX;
  downY = e.clientY;
  downTs = Date.now();
  downValid = true;
}

function onMouseUp(e: MouseEvent) {
  if (!downValid) return;
  downValid = false;
  const dx = Math.abs(e.clientX - downX);
  const dy = Math.abs(e.clientY - downY);
  const dt = Date.now() - downTs;
  if (dx <= CLICK_DISTANCE && dy <= CLICK_DISTANCE && dt <= CLICK_DURATION) {
    onClickBar();
  }
}

function onClickBar() {
  if (window.electronAPI?.floatingBall) {
    window.electronAPI.floatingBall.openMain();
  } else {
    console.log('[FloatingBar] click → open main (mock)');
  }
}

// ===== 指示灯点击灭灯（仅亮灯时可点，复用同一套短按/拖动阈值） =====
let dotDownX = 0;
let dotDownY = 0;
let dotDownTs = 0;
let dotDownValid = false;

function onDotMouseDown(e: MouseEvent) {
  dotDownX = e.clientX;
  dotDownY = e.clientY;
  dotDownTs = Date.now();
  dotDownValid = true;
}

function onDotMouseUp(e: MouseEvent) {
  if (!dotDownValid || pendingCount.value === 0) {
    dotDownValid = false;
    return;
  }
  dotDownValid = false;
  const dx = Math.abs(e.clientX - dotDownX);
  const dy = Math.abs(e.clientY - dotDownY);
  const dt = Date.now() - dotDownTs;
  if (dx > CLICK_DISTANCE || dy > CLICK_DISTANCE || dt > CLICK_DURATION) return;
  onDotClick();
}

function onDotClick() {
  const keys = Object.keys(pendingByCwd);
  if (keys.length === 0) return;
  if (window.electronAPI?.floatingBall) {
    for (const k of keys) {
      window.electronAPI.floatingBall.notifyCleared(k);
    }
  } else {
    console.log('[FloatingBar] dot click → clear pending (mock)', keys);
  }
}
</script>

<template>
  <div class="fb" title="拖动可移动位置，短按切到主窗口"
       @mousedown="onMouseDown" @mouseup="onMouseUp">
    <!-- 右上角：打开主界面按钮 -->
    <div class="fb-open" title="打开主界面" @click.stop="onClickBar">
      <svg viewBox="0 0 16 16" class="fb-open-icon">
        <path d="M3 3h10v10H3z" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M6 8h4M8 6v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>

    <!-- 顶部：通知指示灯（亮灯时点击可灭灯） -->
    <div class="fb-header">
      <div class="fb-dot"
           :class="{ 'fb-dot--active': pendingCount > 0, 'fb-dot--clickable': pendingCount > 0 }"
           :title="pendingCount > 0 ? '点击熄灭指示灯' : ''"
           @mousedown.stop="onDotMouseDown"
           @mouseup.stop="onDotMouseUp"></div>
      <!-- <div class="fb-name" :class="{ 'fb-name--idle': pendingCount === 0 }">{{ projectName }}</div> -->
    </div>

    <!-- 模型用量：纵向堆叠（disabled 不画整行） -->
    <div class="fb-bars">
      <div class="fb-row" v-if="kimiVisible">
        <div class="fb-bar-row">
          <span class="fb-bar-label">K</span>
          <div class="fb-bar">
            <div class="fb-bar-fill"
                 :class="`fb-bar-fill--${kimiFiveHour.level}`"
                 :style="{ width: kimiFiveHour.percent + '%' }"></div>
          </div>
          <span class="fb-bar-pct">{{ kimiFiveHour.percent }}%</span>
        </div>
        <div class="fb-reset" v-if="kimiFiveHour.resetText">{{ kimiFiveHour.resetText }}</div>
      </div>
      <div class="fb-row" v-if="minimaxVisible">
        <div class="fb-bar-row">
          <span class="fb-bar-label">M</span>
          <div class="fb-bar">
            <div class="fb-bar-fill"
                 :class="`fb-bar-fill--${minimaxFiveHour.level}`"
                 :style="{ width: minimaxFiveHour.percent + '%' }"></div>
          </div>
          <span class="fb-bar-pct">{{ minimaxFiveHour.percent }}%</span>
        </div>
        <div class="fb-reset" v-if="minimaxFiveHour.resetText">{{ minimaxFiveHour.resetText }}</div>
        <!-- <div class="fb-bar-row fb-bar-row--secondary" v-if="minimaxWeekly.percent > 0 || minimaxWeekly.resetText">
          <span class="fb-bar-label">W</span>
          <div class="fb-bar">
            <div class="fb-bar-fill fb-bar-fill--muted"
                 :class="`fb-bar-fill--${minimaxWeekly.level}`"
                 :style="{ width: minimaxWeekly.percent + '%' }"></div>
          </div>
          <span class="fb-bar-pct">{{ minimaxWeekly.percent }}%</span>
        </div>
        <div class="fb-reset" v-if="minimaxWeekly.resetText">{{ minimaxWeekly.resetText }}</div> -->
      </div>
      <div class="fb-row" v-if="copilotVisible">
        <div class="fb-bar-row">
          <span class="fb-bar-label">C</span>
          <div class="fb-bar">
            <div class="fb-bar-fill"
                 :class="`fb-bar-fill--${copilotSlot.level}`"
                 :style="{ width: copilotSlot.percent + '%' }"></div>
          </div>
          <span class="fb-bar-pct">{{ copilotSlot.percent }}%</span>
        </div>
        <div class="fb-reset" v-if="copilotSlot.resetText">{{ copilotSlot.resetText }}</div>
      </div>
    </div>
  </div>
</template>
