<script setup lang="ts">
import { computed, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type { ClaudeProject } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';
import { normalizeCwd } from '../utils/cwd';

interface PendingHook { event: string; ts: number }

const props = defineProps<{
  projects: ClaudeProject[];
  now: number;
  isRefreshing: boolean;
  pendingByCwd: Record<string, PendingHook>;
}>();

const emit = defineEmits<{
  refresh: [];
  'clear-pending': [cwd: string];
}>();

// 取项目对应的 pending 条目（已归一化 key）
function pendingFor(p: ClaudeProject): PendingHook | null {
  const key = normalizeCwd(p.cwd ?? null);
  if (!key) return null;
  return props.pendingByCwd[key] ?? null;
}

// 范围选择本地态。默认 5h（与原版一致）
const rangeMs = ref<number>(18_000_000);

const filteredProjects = computed<ClaudeProject[]>(() => {
  return props.projects
    .filter((p) => !!p.lastResponse)
    .filter((p) => {
      if (rangeMs.value === 0) return true;
      const last = new Date(p.lastResponse as string | number).getTime();
      return props.now - last <= rangeMs.value;
    })
    .sort((a, b) => {
      const tb = new Date(b.lastResponse as string | number).getTime();
      const ta = new Date(a.lastResponse as string | number).getTime();
      return tb - ta;
    });
});
</script>

<template>
  <div data-assistant="claude" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <span class="text-[13px] font-medium text-foreground/85">Claude Code</span>
      <div class="no-drag flex items-center gap-1.5">
        <select v-model.number="rangeMs"
          class="claude-range cursor-pointer rounded border border-border bg-background/40 px-1.5 py-0.5 text-xs text-foreground/90 outline-none transition-colors hover:bg-background/60">
          <option :value="18000000">5h</option>
          <option :value="28800000">8h</option>
          <option :value="43200000">12h</option>
          <option :value="86400000">24h</option>
          <option :value="259200000">3d</option>
          <option :value="604800000">7d</option>
          <option :value="2592000000">30d</option>
          <option :value="0">All</option>
        </select>
        <Button variant="ghost" size="icon" class="h-6 w-6" title="Refresh Now" @click="emit('refresh')">
          <RefreshCw :class="{ 'animate-spin': isRefreshing }" />
        </Button>
      </div>
    </div>
    <ul class="max-h-[360px] overflow-y-auto rounded-xl border bg-muted/40 py-1.5">
      <li v-if="filteredProjects.length === 0"
        class="px-2 py-2 text-center text-xs text-muted-foreground">No projects</li>
      <li v-for="p in filteredProjects" :key="p.id"
        class="flex items-center px-2 py-1 transition-colors hover:bg-accent/50">
        <span class="max-w-[60%] truncate text-[13px] text-foreground/85" :title="p.id">{{ p.name }}</span>
        <span
          v-if="pendingFor(p)"
          class="ml-1.5 mr-2 h-2 w-2 shrink-0 cursor-pointer rounded-full bg-[var(--danger)] shadow-[0_0_4px_var(--danger)] animate-[hook-pulse_1.6s_ease-in-out_infinite]"
          :title="pendingFor(p)!.event"
          @click.stop="emit('clear-pending', p.cwd!)"
        />
        <span class="ml-auto shrink-0 text-xs tabular-nums" :class="ageClass(p.lastResponse, now)" :data-ts="p.lastResponse">
          {{ formatAge(p.lastResponse, now) }}
        </span>
      </li>
    </ul>
  </div>
</template>
