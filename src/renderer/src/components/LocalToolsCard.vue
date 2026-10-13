<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import type { LocalToolId, LocalToolPhase, LocalToolStatus, LocalToolsStatus } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';

const props = defineProps<{
  status: LocalToolsStatus | null;
  now: number;
}>();

const PHASE_TEXT: Record<LocalToolPhase, string> = {
  thinking: '思考中',
  editing: '编辑中',
  idle: '空闲',
  offline: '离线',
};

// 整卡聚合文字（working/idle/offline）
const AGG_TEXT: Record<'working' | 'idle' | 'offline', string> = {
  working: '工作中',
  idle: '空闲',
  offline: '离线',
};

// 整卡聚合徽标色：工作中=绿 / 空闲=灰 / 离线=暗灰
const AGG_BADGE_CLASS: Record<'working' | 'idle' | 'offline', string> = {
  working: 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]',
  idle: 'bg-muted text-muted-foreground',
  offline: 'bg-muted/50 text-muted-foreground/50',
};

// 行内状态点
const DOT_CLASS: Record<LocalToolPhase, string> = {
  thinking: 'bg-[var(--fresh)]',
  editing: 'bg-[var(--warn)]',
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

const stateText = computed(() => AGG_TEXT[props.status?.state ?? 'offline']);

function tool(id: LocalToolId): LocalToolStatus | null {
  return props.status ? props.status.tools[id] : null;
}

function baseName(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || null;
}

function phaseOf(t: LocalToolStatus | null): LocalToolPhase {
  return t?.phase ?? 'offline';
}
</script>

<template>
  <div data-assistant="local-tools" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-[13px] font-medium text-foreground/85">Agent</span>
        <Badge variant="outline"
          class="rounded-full border-transparent px-1.5 py-px text-[11px] font-medium"
          :class="AGG_BADGE_CLASS[status?.state ?? 'offline']">{{ stateText }}</Badge>
      </div>
    </div>
    <ul class="rounded-xl border bg-muted/40 py-1.5">
      <li v-for="row in ROWS" :key="row.id" class="px-2 py-1">
        <div class="flex items-center">
          <span class="mr-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
            :class="DOT_CLASS[phaseOf(tool(row.id))]" />
          <span class="max-w-[34%] truncate text-[13px] text-foreground/85">{{ row.label }}</span>
          <span class="ml-1.5 text-[11px] text-muted-foreground"
            :class="tool(row.id)?.phase === 'offline' ? 'opacity-60' : ''">{{ PHASE_TEXT[phaseOf(tool(row.id))] }}</span>
          <span v-if="tool(row.id)?.detail"
            class="ml-1 max-w-[22%] truncate text-[11px] text-muted-foreground/60"
            :title="tool(row.id)?.detail ?? ''">{{ tool(row.id)?.detail }}</span>
          <span class="ml-auto shrink-0 text-xs tabular-nums"
            :class="ageClass(tool(row.id)?.lastActive, now)"
            :data-ts="tool(row.id)?.lastActive ?? undefined">
            {{ formatAge(tool(row.id)?.lastActive, now) }}
          </span>
        </div>
        <div v-if="baseName(tool(row.id)?.cwd) || tool(row.id)?.title"
          class="mt-0.5 flex items-center pl-[22px] text-[11px] text-muted-foreground/70">
          <span v-if="baseName(tool(row.id)?.cwd)" class="max-w-[40%] truncate"
            :title="tool(row.id)?.cwd ?? ''">{{ baseName(tool(row.id)?.cwd) }}</span>
          <span v-if="baseName(tool(row.id)?.cwd) && tool(row.id)?.title" class="mx-1 opacity-50">·</span>
          <span v-if="tool(row.id)?.title" class="max-w-[40%] truncate">{{ tool(row.id)?.title }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
