<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useUsageState } from './composables/useUsageState';
import type { DeepseekUsageData, CodexUsageData, CodexWindowData } from './types/messages';
import { formatAge } from './utils/time';

// 复用悬浮球的 useUsageState → 同样接 WS 拿 init/usageUpdate
const {
  kimiFiveHour,
  kimiWeekly,
  minimaxFiveHour,
  minimaxWeekly,
  copilotSlot,
  codexSlot,
  isProviderVisible,
  deepseek,
  codex,
  lastUpdatedTs,
} = useUsageState();

const kimiVisible    = computed<boolean>(() => isProviderVisible('kimi'));
const minimaxVisible = computed<boolean>(() => isProviderVisible('minimax'));
const copilotVisible = computed<boolean>(() => isProviderVisible('copilot'));
const codexVisible   = computed<boolean>(() => isProviderVisible('codex'));
const deepseekVisible = computed<boolean>(() => isProviderVisible('deepseek'));

// DeepSeek 没有 bar，展示余额即可
const deepseekData = computed<DeepseekUsageData | null>(() => {
  return (deepseek.value?.data as DeepseekUsageData | undefined) ?? null;
});

const deepseekBalanceText = computed<string>(() => {
  const d = deepseekData.value;
  if (!d) return '—';
  const symbol = d.currency === 'CNY' ? '¥' : d.currency === 'USD' ? '$' : (d.currency ? d.currency + ' ' : '');
  return `${symbol}${d.totalBalance.toFixed(2)}`;
});

// Codex primary window 秒数 → 人类可读的窗口标签（与 UsageCard.codexWindowLabel 同步）
const codexWindowData = computed<CodexWindowData | null>(() => {
  return (codex.value?.data as CodexUsageData | undefined)?.primary ?? null;
});
function codexWindowLabel(seconds: number): string {
  if (seconds <= 5 * 3600 + 60) return '5h';
  if (seconds <= 24 * 3600 + 60) return 'day';
  return 'week';
}
const codexWindowTag = computed<string>(() => {
  const w = codexWindowData.value;
  return w ? codexWindowLabel(w.windowSeconds) : '';
});

// formatAge 需要一个会变的 now；保持 computed 一致性，每秒一刷由 useUsageState 的 nowTimer 负责
const now = computed<number>(() => Date.now());

// 是否有任何可见 provider
const anyVisible = computed<boolean>(() =>
  kimiVisible.value || minimaxVisible.value || copilotVisible.value || codexVisible.value || deepseekVisible.value
);

// 把"指针是否在窗口内"汇报给主进程
// 主进程会用它配合 tray 的 mouse-enter/leave 决定要不要取消/排队隐藏弹窗
function reportPointer(inside: boolean): void {
  window.electronAPI?.trayHover?.pointer(inside);
}

// 保存监听器引用，确保 unmount 时能正确解绑
const onEnter = () => reportPointer(true);
const onLeave = () => reportPointer(false);

onMounted(() => {
  document.addEventListener('mouseenter', onEnter);
  document.addEventListener('mouseleave', onLeave);
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseenter', onEnter);
  document.removeEventListener('mouseleave', onLeave);
  // 卸载时主动告诉主进程：指针已经不在我这里了，免得它以为还在卡住隐藏 timer
  reportPointer(false);
});
</script>

<template>
  <div class="th">
    <div class="th-header">
      <span class="th-title">用量速览</span>
      <span class="th-updated" :data-ts="lastUpdatedTs">{{ formatAge(lastUpdatedTs, now) }}</span>
    </div>

    <div class="th-list">
      <!-- Kimi: 5h + week -->
      <div class="th-section" v-if="kimiVisible">
        <div class="th-section-name">Kimi</div>
        <div class="th-row">
          <span class="th-tag">5h</span>
          <span class="th-pct" :class="`th-pct--${kimiFiveHour.level}`">{{ kimiFiveHour.percent }}%</span>
          <span class="th-reset" v-if="kimiFiveHour.resetText">({{ kimiFiveHour.resetText }})</span>
        </div>
        <div class="th-row">
          <span class="th-tag">week</span>
          <span class="th-pct" :class="`th-pct--${kimiWeekly.level}`">{{ kimiWeekly.percent }}%</span>
          <span class="th-reset" v-if="kimiWeekly.resetText">({{ kimiWeekly.resetText }})</span>
        </div>
      </div>

      <!-- MiniMax: 5h + week -->
      <div class="th-section" v-if="minimaxVisible">
        <div class="th-section-name">MiniMax</div>
        <div class="th-row">
          <span class="th-tag">5h</span>
          <span class="th-pct" :class="`th-pct--${minimaxFiveHour.level}`">{{ minimaxFiveHour.percent }}%</span>
          <span class="th-reset" v-if="minimaxFiveHour.resetText">({{ minimaxFiveHour.resetText }})</span>
        </div>
        <div class="th-row">
          <span class="th-tag">week</span>
          <span class="th-pct" :class="`th-pct--${minimaxWeekly.level}`">{{ minimaxWeekly.percent }}%</span>
          <span class="th-reset" v-if="minimaxWeekly.resetText">({{ minimaxWeekly.resetText }})</span>
        </div>
      </div>

      <!-- Copilot: premium -->
      <div class="th-section" v-if="copilotVisible">
        <div class="th-section-name">Copilot</div>
        <div class="th-row">
          <span class="th-tag">premium</span>
          <span class="th-pct" :class="`th-pct--${copilotSlot.level}`">{{ copilotSlot.percent }}%</span>
          <span class="th-reset" v-if="copilotSlot.resetText">({{ copilotSlot.resetText }})</span>
        </div>
      </div>

      <!-- Codex: primary window -->
      <div class="th-section" v-if="codexVisible">
        <div class="th-section-name">Codex</div>
        <div class="th-row">
          <span class="th-tag">{{ codexWindowTag || '—' }}</span>
          <span class="th-pct" :class="`th-pct--${codexSlot.level}`">{{ codexSlot.percent }}%</span>
          <span class="th-reset" v-if="codexSlot.resetText">({{ codexSlot.resetText }})</span>
        </div>
      </div>

      <!-- DeepSeek: 余额 -->
      <div class="th-section" v-if="deepseekVisible">
        <div class="th-section-name">DeepSeek</div>
        <div class="th-row">
          <span class="th-tag">余额</span>
          <span class="th-balance">{{ deepseekBalanceText }}</span>
        </div>
      </div>

      <div class="th-empty" v-if="!anyVisible">无用量数据</div>
    </div>
  </div>
</template>