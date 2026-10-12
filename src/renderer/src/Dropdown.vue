<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useUsageState } from './composables/useUsageState';
import { useTheme } from './composables/useTheme';
import { formatAge, ageClass } from './utils/time';
import { Badge } from './components/ui/badge';
import type { KimiSessionState, KimiAggregateState } from './types/messages';

useTheme();

const { kimiRecentProjects, kimiFiveHour, kimiWeekly, kimiStatus, isConnected } = useUsageState();

const now = ref<number>(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  tick = setInterval(() => { now.value = Date.now(); }, 1000);
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  if (tick) { clearInterval(tick); tick = null; }
  window.removeEventListener('keydown', onKeydown);
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

function close() {
  window.electronAPI?.floatingBall?.toggleDropdown();
}

const STATE_TEXT: Record<KimiAggregateState, string> = {
  thinking: '思考中',
  editing: '编辑中',
  approval: '待审核',
  idle: '空闲',
  offline: '离线',
};

// 状态胶囊配色：明/暗各一套，避免亮色主题下低对比度
const STATE_BADGE: Record<KimiAggregateState, string> = {
  thinking: 'bg-blue-600/10 text-blue-600 dark:bg-blue-300/15 dark:text-blue-300',
  editing: 'bg-green-600/10 text-green-600 dark:bg-green-300/15 dark:text-green-300',
  approval: 'bg-amber-600/10 text-amber-600 dark:bg-yellow-300/15 dark:text-yellow-300',
  idle: 'bg-zinc-500/10 text-zinc-500 dark:bg-zinc-400/15 dark:text-zinc-400',
  offline: 'bg-zinc-500/10 text-zinc-400 dark:bg-zinc-500/15 dark:text-zinc-500',
};

// 目录行右侧忙态小圆点颜色（与主界面一致：红=待审核 / 黄=编辑 / 绿=思考 / 灰=空闲）
const DOT_CLASS: Record<KimiSessionState, string> = {
  approval: 'bg-[color:var(--danger)] shadow-[0_0_4px_var(--danger)]',
  editing: 'bg-[color:var(--warn)]',
  thinking: 'bg-[color:var(--fresh)]',
  idle: 'bg-muted-foreground/40',
};

// 用量条填充色（三档 + 无数据灰条）
const FILL_CLASS: Record<string, string> = {
  fresh: 'bg-[color:var(--fresh)]',
  warn: 'bg-[color:var(--warn)]',
  danger: 'bg-[color:var(--danger)]',
  muted: 'bg-muted-foreground/40',
};

// 项目时间三档着色
const TIME_CLASS: Record<string, string> = {
  'age-fresh': 'text-[color:var(--fresh)]',
  'age-warn': 'text-[color:var(--warn)]',
  'age-stale': 'text-muted-foreground',
};

const stateText = computed(() => STATE_TEXT[kimiStatus?.value?.state ?? 'offline']);
</script>

<template>
  <div class="no-drag flex max-h-[420px] w-[260px] flex-col overflow-hidden rounded-xl border border-border/70 bg-popover/90 shadow-lg backdrop-blur-xl">
    <!-- 顶部：整体状态 + 用量 -->
    <header class="flex items-start justify-between border-b border-border/50 px-3.5 pb-2.5 pt-3">
      <div class="flex min-w-0 flex-col gap-1">
        <Badge
          :class="STATE_BADGE[kimiStatus?.state ?? 'offline']"
          class="self-start rounded-full px-2 py-0.5 text-[11px] font-medium"
        >
          {{ stateText }}
        </Badge>
        <span class="text-[13px] font-semibold text-foreground/90">Kimi Code</span>
      </div>
      <div class="ml-3.5 min-w-0 max-w-[130px] flex-1">
        <div class="mb-1 flex justify-between text-[11px] text-foreground/75">
          <span>Kimi 5h</span>
          <span class="font-semibold text-foreground/90">{{ kimiFiveHour.percent }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-foreground/10">
          <div
            class="h-full rounded-[3px] transition-[width,background-color] duration-500 ease-out"
            :class="FILL_CLASS[kimiFiveHour.level]"
            :style="{ width: kimiFiveHour.percent + '%' }"
          ></div>
        </div>
        <div v-if="kimiFiveHour.resetText" class="mt-1 truncate text-[9px] text-foreground/40">{{ kimiFiveHour.resetText }}</div>

        <div class="mb-1 mt-2 flex justify-between text-[11px] text-foreground/75">
          <span>Kimi 周</span>
          <span class="font-semibold text-foreground/90">{{ kimiWeekly.percent }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-[3px] bg-foreground/10">
          <div
            class="h-full rounded-[3px] transition-[width,background-color] duration-500 ease-out"
            :class="FILL_CLASS[kimiWeekly.level]"
            :style="{ width: kimiWeekly.percent + '%' }"
          ></div>
        </div>
        <div v-if="kimiWeekly.resetText" class="mt-1 truncate text-[9px] text-foreground/40">{{ kimiWeekly.resetText }}</div>
      </div>
    </header>

    <!-- 项目列表：最近活跃项目 -->
    <div class="min-h-0 overflow-y-auto px-3.5 py-2">
      <div class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/35">最近项目</div>
      <ul class="flex flex-col divide-y divide-border/40">
        <li v-if="kimiRecentProjects.length === 0" class="py-3 text-center text-[12px] text-foreground/40">
          {{ kimiStatus?.available ? '暂无最近活动项目' : 'Kimi 服务不可达' }}
        </li>
        <li v-for="p in kimiRecentProjects" :key="p.id" class="flex min-w-0 items-center gap-[7px] py-[5px]">
          <span class="h-2 w-2 shrink-0 rounded-full" :class="DOT_CLASS[p.state]" />
          <span class="min-w-0 flex-1 truncate text-[12px] text-foreground/85" :title="p.cwd || p.id">{{ p.name }}</span>
          <span v-if="p.pending" class="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--danger)]" title="待审核" />
          <span class="shrink-0 whitespace-nowrap text-[10px]" :class="TIME_CLASS[ageClass(p.lastResponse, now)]">{{ formatAge(p.lastResponse, now) }}</span>
        </li>
      </ul>
    </div>

    <footer class="flex justify-end border-t border-border/50 px-3.5 py-2">
      <span class="inline-flex items-center gap-1 text-[10px] text-foreground/35">
        <span class="h-1.5 w-1.5 rounded-full" :class="isConnected ? 'bg-[color:var(--fresh)]' : 'bg-[color:var(--muted-fg)]'"></span>
        {{ isConnected ? '已连接' : '未连接' }}
      </span>
    </footer>
  </div>
</template>
