<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ClaudeProject } from '../types/messages';
import { formatAge, ageClass } from '../utils/time';

const props = defineProps<{
  projects: ClaudeProject[];
  now: number;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

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
  <div class="status-card" data-assistant="claude">
    <div class="claude-header">
      <span class="claude-title">Claude Code</span>
      <div class="header-controls">
        <select class="claude-range" v-model.number="rangeMs">
          <option :value="18000000">5h</option>
          <option :value="28800000">8h</option>
          <option :value="43200000">12h</option>
          <option :value="86400000">24h</option>
          <option :value="259200000">3d</option>
          <option :value="604800000">7d</option>
          <option :value="2592000000">30d</option>
          <option :value="0">All</option>
        </select>
        <button class="btn-refresh" :class="{ spinning: isRefreshing }" title="Refresh Now" @click="emit('refresh')">↻</button>
      </div>
    </div>
    <ul class="project-list">
      <li v-if="filteredProjects.length === 0" class="project-empty">No projects</li>
      <li v-for="p in filteredProjects" :key="p.id" class="project-row">
        <span class="project-name" :title="p.id">{{ p.name }}</span>
        <span class="project-time" :class="ageClass(p.lastResponse, now)" :data-ts="p.lastResponse">
          {{ formatAge(p.lastResponse, now) }}
        </span>
      </li>
    </ul>
  </div>
</template>
