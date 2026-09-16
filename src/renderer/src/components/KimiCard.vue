<script setup lang="ts">
import { computed } from 'vue';
import type { KimiStatus, KimiProject, KimiSessionState, KimiAggregateState } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';

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

// 目录行右侧的忙态小圆点颜色（红=待审核 / 黄=编辑 / 绿=思考 / 灰=空闲）
const DOT_CLASS: Record<KimiSessionState, string> = {
  approval: 'dot-approval',
  editing: 'dot-editing',
  thinking: 'dot-thinking',
  idle: 'dot-idle',
};

const projects = computed<KimiProject[]>(() => props.status?.projects ?? []);
const stateText = computed(() => STATE_TEXT[props.status?.state ?? 'offline']);
</script>

<template>
  <div class="status-card" data-assistant="kimi">
    <div class="claude-header">
      <div class="kimi-header-left">
        <span class="claude-title">Kimi Code (web)</span>
        <span class="kimi-state-badge" :data-state="status?.state ?? 'offline'">{{ stateText }}</span>
      </div>
      <div class="header-controls">
        <button class="btn-refresh" :class="{ spinning: isRefreshing }" title="Refresh Now" @click="emit('refresh')">↻</button>
      </div>
    </div>
    <ul class="project-list">
      <li v-if="projects.length === 0" class="project-empty">No sessions</li>
      <li v-for="p in projects" :key="p.id" class="project-row">
        <span class="kimi-state-dot" :class="DOT_CLASS[p.state]" :title="stateText" />
        <span class="project-name" :title="p.id">{{ p.name }}</span>
        <span v-if="p.pending" class="hook-badge" title="待审核" />
        <span class="project-time" :class="ageClass(p.lastResponse, now)" :data-ts="p.lastResponse">
          {{ formatAge(p.lastResponse, now) }}
        </span>
      </li>
    </ul>
  </div>
</template>