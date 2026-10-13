<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import type { LocalToolId, LocalToolPhase, LocalToolStatus, LocalToolProject, LocalToolsStatus } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';
import { filterTodayLocalProjects } from '../utils/localToolsFilter';

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

// 整卡聚合文字/徽标（working/idle/offline）
const AGG_TEXT: Record<'working' | 'idle' | 'offline', string> = {
  working: '工作中',
  idle: '空闲',
  offline: '离线',
};
const AGG_BADGE_CLASS: Record<'working' | 'idle' | 'offline', string> = {
  working: 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]',
  idle: 'bg-muted text-muted-foreground',
  offline: 'bg-muted/50 text-muted-foreground/50',
};

// 忙态状态点：思考=绿 / 编辑=黄 / 空闲=灰 / 离线=半透明灰
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

function phaseOf(t: LocalToolStatus | null): LocalToolPhase {
  return t?.phase ?? 'offline';
}

function projectsOf(t: LocalToolStatus | null): LocalToolProject[] {
  if (!t) return [];
  return filterTodayLocalProjects(t.projects, props.now);
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

    <div class="rounded-xl border bg-muted/40 py-1.5">
      <!-- 每个工具：标题行 + 项目列表 -->
      <div v-for="row in ROWS" :key="row.id" class="px-2 py-1">
        <div class="flex items-center">
          <span class="mr-1.5 h-[7px] w-[7px] shrink-0 rounded-full"
            :class="DOT_CLASS[phaseOf(tool(row.id))]" />
          <span class="max-w-[30%] truncate text-[13px] font-medium text-foreground/85">{{ row.label }}</span>
          <span class="ml-1.5 text-[11px] text-muted-foreground"
            :class="phaseOf(tool(row.id)) === 'offline' ? 'opacity-60' : ''">{{ PHASE_TEXT[phaseOf(tool(row.id))] }}</span>
          <span v-if="tool(row.id)?.detail"
            class="ml-1 max-w-[20%] truncate text-[11px] text-muted-foreground/60"
            :title="tool(row.id)?.detail ?? ''">{{ tool(row.id)?.detail }}</span>
          <span class="ml-auto shrink-0 text-xs tabular-nums"
            :class="ageClass(tool(row.id)?.lastActive, now)"
            :data-ts="tool(row.id)?.lastActive ?? undefined">
            {{ formatAge(tool(row.id)?.lastActive, now) }}
          </span>
        </div>

        <!-- 项目行 -->
        <ul v-if="projectsOf(tool(row.id)).length" class="mt-0.5">
          <li v-for="p in projectsOf(tool(row.id))" :key="p.id"
            class="flex items-center px-3 py-0.5"
            :class="phaseOf(tool(row.id)) === 'offline' ? 'opacity-50' : ''">
            <span class="mr-1.5 h-[6px] w-[6px] shrink-0 rounded-full"
              :class="DOT_CLASS[p.phase]" />
            <span class="max-w-[32%] truncate text-[12px] text-foreground/80"
              :title="p.cwd ?? undefined">{{ p.name }}</span>
            <span v-if="p.title" class="ml-1.5 max-w-[30%] truncate text-[11px] text-muted-foreground/80"
              :title="p.title">{{ p.title }}</span>
            <span class="ml-auto shrink-0 text-[11px] tabular-nums"
              :class="ageClass(p.lastActive, now)"
              :data-ts="p.lastActive ?? undefined">
              {{ formatAge(p.lastActive, now) }}
            </span>
          </li>
        </ul>
        <p v-else-if="tool(row.id) && phaseOf(tool(row.id)) !== 'offline'"
          class="mt-0.5 px-3 text-[11px] text-muted-foreground/60">今日无活动</p>
      </div>
    </div>
  </div>
</template>
