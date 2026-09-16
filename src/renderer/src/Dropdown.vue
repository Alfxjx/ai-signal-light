<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useUsageState } from './composables/useUsageState';
import { formatAge, ageClass } from './utils/time';
import type { KimiSessionState, KimiAggregateState } from './types/messages';

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

// 目录行右侧忙态小圆点颜色（与主界面一致：红=待审核 / 黄=编辑 / 绿=思考 / 灰=空闲）
const DOT_CLASS: Record<KimiSessionState, string> = {
  approval: 'dot-approval',
  editing: 'dot-editing',
  thinking: 'dot-thinking',
  idle: 'dot-idle',
};

const stateText = computed(() => STATE_TEXT[kimiStatus?.value?.state ?? 'offline']);
</script>

<template>
  <div class="dd">
    <!-- 顶部：整体状态 + 用量 -->
    <header class="dd-head">
      <div class="dd-title">
        <span class="dd-state" :data-state="kimiStatus?.state ?? 'offline'">{{ stateText }}</span>
        <span class="dd-name">Kimi Code</span>
      </div>
      <div class="dd-usage">
        <div class="dd-usage-label">
          <span>Kimi 5h</span>
          <span class="dd-usage-pct">{{ kimiFiveHour.percent }}%</span>
        </div>
        <div class="dd-usage-bar">
          <div class="dd-usage-fill" :class="`dd-usage-fill--${kimiFiveHour.level}`"
               :style="{ width: kimiFiveHour.percent + '%' }"></div>
        </div>
        <div v-if="kimiFiveHour.resetText" class="dd-usage-reset">{{ kimiFiveHour.resetText }}</div>

        <div class="dd-usage-label dd-usage-label--week">
          <span>Kimi 周</span>
          <span class="dd-usage-pct">{{ kimiWeekly.percent }}%</span>
        </div>
        <div class="dd-usage-bar">
          <div class="dd-usage-fill" :class="`dd-usage-fill--${kimiWeekly.level}`"
               :style="{ width: kimiWeekly.percent + '%' }"></div>
        </div>
        <div v-if="kimiWeekly.resetText" class="dd-usage-reset">{{ kimiWeekly.resetText }}</div>
      </div>
    </header>

    <!-- 项目列表：最近活跃项目 -->
    <div class="dd-projects">
      <div class="dd-section-title">最近项目</div>
      <ul class="dd-list">
        <li v-if="kimiRecentProjects.length === 0" class="dd-empty">
          {{ kimiStatus?.available ? '暂无最近活动项目' : 'Kimi 服务不可达' }}
        </li>
        <li v-for="p in kimiRecentProjects" :key="p.id" class="dd-row">
          <span class="dd-dot" :class="DOT_CLASS[p.state]" />
          <span class="dd-name-text" :title="p.cwd || p.id">{{ p.name }}</span>
          <span v-if="p.pending" class="dd-pending" title="待审核" />
          <span class="dd-time" :class="ageClass(p.lastResponse, now)">{{ formatAge(p.lastResponse, now) }}</span>
        </li>
      </ul>
    </div>

    <footer class="dd-foot">
      <span class="dd-conn" :class="{ 'is-off': !isConnected }">
        <span class="dot"></span> {{ isConnected ? '已连接' : '未连接' }}
      </span>
    </footer>
  </div>
</template>