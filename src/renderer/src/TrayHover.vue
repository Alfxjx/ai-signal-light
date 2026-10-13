<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useUsageState } from './composables/useUsageState';
import { useTheme } from './composables/useTheme';
import type { DeepseekUsageData, MimoUsageData, CodexUsageData, CodexWindowData } from './types/messages';
import { formatAge } from './utils/time';

// 应用明暗主题（跟随设置，监听主进程 theme:changed 即时切换）
useTheme();

// 百分比三档着色：level → 状态色 CSS 变量（fresh/warn/danger/muted）
const LEVEL_COLOR: Record<'fresh' | 'warn' | 'danger' | 'muted', string> = {
  fresh: 'var(--fresh)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  muted: 'var(--muted-fg)',
};

// 复用悬浮球的 useUsageState → 同样接 WS 拿 init/usageUpdate
const {
  kimiFiveHour,
  kimiWeekly,
  minimaxFiveHour,
  minimaxWeekly,
  copilotSlot,
  codexSlot,
  volcengineSlots,
  isProviderVisible,
  deepseek,
  codex,
  mimo,
  lastUpdatedTs,
  isConnected,
  send,
} = useUsageState();

const kimiVisible    = computed<boolean>(() => isProviderVisible('kimi'));
const minimaxVisible = computed<boolean>(() => isProviderVisible('minimax'));
const copilotVisible = computed<boolean>(() => isProviderVisible('copilot'));
const codexVisible   = computed<boolean>(() => isProviderVisible('codex'));
const deepseekVisible = computed<boolean>(() => isProviderVisible('deepseek'));
const mimoVisible = computed<boolean>(() => isProviderVisible('mimo'));
const volcengineVisible = computed<boolean>(() => isProviderVisible('volcengine'));

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

// MiMo 同样是余额型
const mimoData = computed<MimoUsageData | null>(() => {
  return (mimo.value?.data as MimoUsageData | undefined) ?? null;
});

const mimoBalanceText = computed<string>(() => {
  const d = mimoData.value;
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
  kimiVisible.value || minimaxVisible.value || copilotVisible.value || codexVisible.value || deepseekVisible.value || mimoVisible.value || volcengineVisible.value
);

// 手动刷新：点击标题旁的刷新按钮，向服务端请求一次用量刷新
const isRefreshing = ref(false);
function onRefresh(): void {
  if (isConnected.value && send({ type: 'refresh' })) {
    isRefreshing.value = true;
    setTimeout(() => { isRefreshing.value = false; }, 1000);
  }
}

// 保存监听器引用，确保 unmount 时能正确解绑
const onEnter = () => reportPointer(true);
const onLeave = () => reportPointer(false);

// 把"指针是否在窗口内"汇报给主进程
// 主进程会用它配合 tray 的 mouse-enter/leave 决定要不要取消/排队隐藏弹窗
function reportPointer(inside: boolean): void {
  window.electronAPI?.trayHover?.pointer(inside);
}

// 弹窗高度随 section 数量变化，渲染层量出内容高度交给主进程调整窗口
// （provider 会增减，写死高度必然对不上）
const root = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;
let lastReportedHeight = 0;

function reportContentHeight(): void {
  const el = root.value;
  if (!el) return;
  // 用 scrollHeight 取完整内容高度：窗口当前可能比内容矮
  const h = Math.ceil(el.scrollHeight);
  if (h === lastReportedHeight) return;
  lastReportedHeight = h;
  window.electronAPI?.trayHover?.resize(h);
}

onMounted(() => {
  document.addEventListener('mouseenter', onEnter);
  document.addEventListener('mouseleave', onLeave);
  reportContentHeight();
  if (root.value) {
    resizeObserver = new ResizeObserver(reportContentHeight);
    resizeObserver.observe(root.value);
  }
  window.addEventListener('resize', reportContentHeight);
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseenter', onEnter);
  document.removeEventListener('mouseleave', onLeave);
  window.removeEventListener('resize', reportContentHeight);
  resizeObserver?.disconnect();
  resizeObserver = null;
  // 卸载时主动告诉主进程：指针已经不在我这里了，免得它以为还在卡住隐藏 timer
  reportPointer(false);
});
</script>

<template>
  <div ref="root" class="flex w-[200px] flex-col gap-2.5 rounded-lg border bg-popover px-3.5 pb-3 pt-2.5 shadow-[0_6px_24px_rgba(0,0,0,0.5)] no-drag">
    <div class="flex items-baseline justify-between gap-2 border-b pb-1.5">
      <div class="flex items-center gap-1.5">
        <span class="text-[11px] font-semibold tracking-wide text-foreground/85">用量速览</span>
        <button
          class="flex h-[15px] w-[15px] cursor-pointer items-center justify-center rounded bg-muted/80 p-0 text-[10px] leading-none text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          :class="{ 'animate-spin': isRefreshing }"
          title="刷新"
          @click="onRefresh"
        >↻</button>
      </div>
      <span class="text-[10px] tabular-nums text-muted-foreground/70" :data-ts="lastUpdatedTs">{{ formatAge(lastUpdatedTs, now) }}</span>
    </div>

    <div class="flex flex-col gap-2">
      <!-- Kimi: 5h + week -->
      <div class="flex flex-col gap-0.5" v-if="kimiVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">Kimi</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">5h</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[kimiFiveHour.level] }">{{ kimiFiveHour.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="kimiFiveHour.resetText">({{ kimiFiveHour.resetText }})</span>
        </div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">week</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[kimiWeekly.level] }">{{ kimiWeekly.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="kimiWeekly.resetText">({{ kimiWeekly.resetText }})</span>
        </div>
      </div>

      <!-- MiniMax: 5h + week -->
      <div class="flex flex-col gap-0.5" v-if="minimaxVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">MiniMax</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">5h</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[minimaxFiveHour.level] }">{{ minimaxFiveHour.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="minimaxFiveHour.resetText">({{ minimaxFiveHour.resetText }})</span>
        </div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">week</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[minimaxWeekly.level] }">{{ minimaxWeekly.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="minimaxWeekly.resetText">({{ minimaxWeekly.resetText }})</span>
        </div>
      </div>

      <!-- Copilot: premium -->
      <div class="flex flex-col gap-0.5" v-if="copilotVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">Copilot</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">premium</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[copilotSlot.level] }">{{ copilotSlot.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="copilotSlot.resetText">({{ copilotSlot.resetText }})</span>
        </div>
      </div>

      <!-- Codex: primary window -->
      <div class="flex flex-col gap-0.5" v-if="codexVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">Codex</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">{{ codexWindowTag || '—' }}</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[codexSlot.level] }">{{ codexSlot.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="codexSlot.resetText">({{ codexSlot.resetText }})</span>
        </div>
      </div>

      <!-- DeepSeek: 余额 -->
      <div class="flex flex-col gap-0.5" v-if="deepseekVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">DeepSeek</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">余额</span>
          <span class="font-medium tabular-nums text-foreground/75">{{ deepseekBalanceText }}</span>
        </div>
      </div>

      <!-- MiMo: 余额 -->
      <div class="flex flex-col gap-0.5" v-if="mimoVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">MiMo</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">余额</span>
          <span class="font-medium tabular-nums text-foreground/75">{{ mimoBalanceText }}</span>
        </div>
      </div>

      <!-- 火山 Ark Coding Plan: session(5h) + weekly + monthly -->
      <div class="flex flex-col gap-0.5" v-if="volcengineVisible">
        <div class="mb-0.5 text-xs font-semibold tracking-wide text-foreground/90">Ark Coding Plan</div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">session</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[volcengineSlots.session.level] }">{{ volcengineSlots.session.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="volcengineSlots.session.resetText">({{ volcengineSlots.session.resetText }})</span>
        </div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">weekly</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[volcengineSlots.weekly.level] }">{{ volcengineSlots.weekly.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="volcengineSlots.weekly.resetText">({{ volcengineSlots.weekly.resetText }})</span>
        </div>
        <div class="no-drag flex items-baseline gap-1.5 pl-3 text-[11px] leading-normal">
          <span class="min-w-[36px] shrink-0 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">monthly</span>
          <span class="shrink-0 font-semibold tabular-nums" :style="{ color: LEVEL_COLOR[volcengineSlots.monthly.level] }">{{ volcengineSlots.monthly.percent }}%</span>
          <span class="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground/70" v-if="volcengineSlots.monthly.resetText">({{ volcengineSlots.monthly.resetText }})</span>
        </div>
      </div>

      <div class="py-2 text-center text-[11px] text-muted-foreground" v-if="!anyVisible">无用量数据</div>
    </div>
  </div>
</template>