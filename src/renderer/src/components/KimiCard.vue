<script setup lang="ts">
import { computed } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KimiStatus, KimiProject, KimiSessionState, KimiAggregateState } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';
import { filterTodayProjects } from '../utils/kimiFilter';

const props = defineProps<{
  status: KimiStatus | null;
  now: number;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{ refresh: [] }>();

const STATE_TEXT: Record<KimiAggregateState, string> = {
  thinking: '思考中',
  editing: '编辑中',
  approval: '待审核',
  idle: '空闲',
  offline: '离线',
};

// 状态胶囊：色值走 CSS 变量，背景用 color-mix 柔和化（Tailwind 无法对 var() 直接加透明度）
const STATE_BADGE_CLASS: Record<KimiAggregateState, string> = {
  thinking: 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]',
  editing: 'bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-[var(--warn)]',
  approval: 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]',
  idle: 'bg-muted text-muted-foreground',
  offline: 'bg-muted/50 text-muted-foreground/50',
};

// 目录行右侧的忙态小圆点颜色（红=待审核 / 黄=编辑 / 绿=思考 / 灰=空闲）
const DOT_CLASS: Record<KimiSessionState, string> = {
  approval: 'bg-[var(--danger)]',
  editing: 'bg-[var(--warn)]',
  thinking: 'bg-[var(--fresh)]',
  idle: 'bg-[var(--muted-fg)]',
};

const allProjects = computed<KimiProject[]>(() => props.status?.projects ?? []);
// 只显示当日：今天动过的目录，外加正在跑/等确认的会话（时间戳过期也不隐藏）
const projects = computed<KimiProject[]>(() => filterTodayProjects(allProjects.value, props.now));
const emptyText = computed(() => (allProjects.value.length === 0 ? 'No sessions' : '今日无活动'));
const stateText = computed(() => STATE_TEXT[props.status?.state ?? 'offline']);
</script>

<template>
  <div data-assistant="kimi" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-[13px] font-medium text-foreground/85">Kimi Code (web)</span>
        <Badge variant="outline"
          class="rounded-full border-transparent px-1.5 py-px text-[11px] font-medium"
          :class="STATE_BADGE_CLASS[status?.state ?? 'offline']">{{ stateText }}</Badge>
      </div>
      <div class="no-drag flex items-center gap-1.5">
        <Button variant="ghost" size="icon" class="h-6 w-6" title="Refresh Now" @click="emit('refresh')">
          <RefreshCw :class="{ 'animate-spin': isRefreshing }" />
        </Button>
      </div>
    </div>
    <ul class="max-h-[360px] overflow-y-auto rounded-xl border bg-muted/40 py-1.5">
      <li v-if="projects.length === 0"
        class="px-2 py-2 text-center text-xs text-muted-foreground">{{ emptyText }}</li>
      <li v-for="p in projects" :key="p.id"
        class="flex items-center px-2 py-1 transition-colors hover:bg-accent/50">
        <span class="mr-1.5 h-[7px] w-[7px] shrink-0 rounded-full" :class="DOT_CLASS[p.state]"
          :title="stateText" />
        <span class="max-w-[60%] truncate text-[13px] text-foreground/85" :title="p.id">{{ p.name }}</span>
        <span v-if="p.pending"
          class="ml-1.5 mr-2 h-2 w-2 shrink-0 cursor-pointer rounded-full bg-[var(--danger)] shadow-[0_0_4px_var(--danger)] animate-[hook-pulse_1.6s_ease-in-out_infinite]"
          title="待审核" />
        <span class="ml-auto shrink-0 text-xs tabular-nums" :class="ageClass(p.lastResponse, now)" :data-ts="p.lastResponse">
          {{ formatAge(p.lastResponse, now) }}
        </span>
      </li>
    </ul>
  </div>
</template>
