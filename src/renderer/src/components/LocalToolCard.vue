<script setup lang="ts">
import { computed } from 'vue';
import { Badge } from '@/components/ui/badge';
import type { LocalToolId, LocalToolPhase, LocalToolProject, LocalToolStatus, LocalToolsStatus } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';
import { filterTodayLocalProjects } from '../utils/localToolsFilter';

const props = defineProps<{
  toolId: LocalToolId;
  status: LocalToolsStatus | null;
  now: number;
}>();

const TOOL_LABEL: Record<LocalToolId, string> = {
  codex: 'Codex · ChatGPT',
  mcode: 'MiniMax Code',
  opencode: 'opencode',
};

const PHASE_TEXT: Record<LocalToolPhase, string> = {
  thinking: '思考中',
  editing: '编辑中',
  idle: '空闲',
  offline: '离线',
};

// 忙态徽标：思考=绿 / 编辑=黄 / 空闲=灰 / 离线=暗灰（色值走 CSS 变量，背景用 color-mix 柔和化）
const PHASE_BADGE_CLASS: Record<LocalToolPhase, string> = {
  thinking: 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]',
  editing: 'bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-[var(--warn)]',
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

const tool = computed<LocalToolStatus | null>(() =>
  props.status ? props.status.tools[props.toolId] : null,
);

// 该工具是否"存在"（有进程 / 有版本·服务信息 / 有过会话），否则整卡隐藏
const present = computed<boolean>(() => {
  const t = tool.value;
  return !!t && (t.running || t.detail != null || t.projects.length > 0);
});

// 项目列表：当日裁剪（非 idle 强留），对齐 KimiCard
const projects = computed<LocalToolProject[]>(() =>
  filterTodayLocalProjects(tool.value?.projects ?? [], props.now),
);
</script>

<template>
  <div v-if="present" data-assistant="local-tools" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-[13px] font-medium text-foreground/85">{{ TOOL_LABEL[toolId] }}</span>
        <Badge variant="outline"
          class="rounded-full border-transparent px-1.5 py-px text-[11px] font-medium"
          :class="PHASE_BADGE_CLASS[tool?.phase ?? 'offline']">{{ PHASE_TEXT[tool?.phase ?? 'offline'] }}</Badge>
        <span v-if="tool?.detail" class="max-w-[30%] truncate text-[11px] text-muted-foreground/60"
          :title="tool.detail">{{ tool.detail }}</span>
      </div>
    </div>
    <ul class="max-h-[240px] overflow-y-auto rounded-xl border bg-muted/40 py-1.5">
      <li v-if="projects.length === 0"
        class="px-2 py-2 text-center text-xs text-muted-foreground">今日无活动</li>
      <li v-for="p in projects" :key="p.id"
        class="flex items-center px-2 py-1 transition-colors hover:bg-accent/50"
        :class="tool?.phase === 'offline' ? 'opacity-50' : ''">
        <span class="mr-1.5 h-[6px] w-[6px] shrink-0 rounded-full"
          :class="DOT_CLASS[p.phase]" />
        <span class="max-w-[36%] truncate text-[12px] text-foreground/80"
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
  </div>
</template>
