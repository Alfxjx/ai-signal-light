<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import type { LocalToolId, LocalToolState, LocalToolStatus, LocalToolsStatus } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';

const props = defineProps<{
  status: LocalToolsStatus | null;
  now: number;
}>();

const STATE_TEXT: Record<LocalToolState, string> = {
  working: '工作中',
  idle: '空闲',
  offline: '离线',
};

// 状态徽标：工作中=绿 / 空闲=灰 / 离线=暗灰（色值走 CSS 变量，背景用 color-mix 柔和化）
const STATE_BADGE_CLASS: Record<LocalToolState, string> = {
  working: 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]',
  idle: 'bg-muted text-muted-foreground',
  offline: 'bg-muted/50 text-muted-foreground/50',
};

// 行内状态点：工作中=绿 / 空闲=灰 / 离线=半透明灰
const DOT_CLASS: Record<LocalToolState, string> = {
  working: 'bg-[var(--fresh)]',
  idle: 'bg-[var(--muted-fg)]',
  offline: 'bg-[var(--muted-fg)] opacity-40',
};

interface ToolRow {
  id: LocalToolId;
  label: string;
}

const ROWS: ToolRow[] = [
  { id: 'codex', label: 'Codex · ChatGPT' },
  { id: 'mcode', label: 'MiniMax Code' },
  { id: 'opencode', label: 'opencode' },
];

const stateText = computed(() => STATE_TEXT[props.status?.state ?? 'offline']);

function tool(id: LocalToolId): LocalToolStatus | null {
  return props.status ? props.status.tools[id] : null;
}
</script>

<template>
  <div data-assistant="local-tools" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-[13px] font-medium text-foreground/85">Agent</span>
        <Badge variant="outline"
          class="rounded-full border-transparent px-1.5 py-px text-[11px] font-medium"
          :class="STATE_BADGE_CLASS[status?.state ?? 'offline']">{{ stateText }}</Badge>
      </div>
    </div>
    <ul class="rounded-xl border bg-muted/40 py-1.5">
      <li v-for="row in ROWS" :key="row.id" class="flex items-center px-2 py-1">
        <span class="mr-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
          :class="DOT_CLASS[tool(row.id)?.state ?? 'offline']" />
        <span class="max-w-[38%] truncate text-[13px] text-foreground/85">{{ row.label }}</span>
        <span v-if="tool(row.id)?.detail"
          class="ml-1.5 max-w-[30%] truncate text-[11px] text-muted-foreground"
          :title="tool(row.id)?.detail ?? ''">{{ tool(row.id)?.detail }}</span>
        <span class="ml-auto shrink-0 text-xs tabular-nums"
          :class="ageClass(tool(row.id)?.lastActive, now)"
          :data-ts="tool(row.id)?.lastActive ?? undefined">
          {{ formatAge(tool(row.id)?.lastActive, now) }}
        </span>
      </li>
    </ul>
  </div>
</template>
