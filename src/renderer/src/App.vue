<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import TitleBar from './components/TitleBar.vue';
import ClaudeCard from './components/ClaudeCard.vue';
import UsageCard from './components/UsageCard.vue';
import { useWebSocket } from './composables/useWebSocket';
import type {
  ClaudeProject,
  UsageState,
  WsMessage,
  AssistantStatus,
  UsageInitPayload,
  UsageUpdatePayload,
  ProviderId,
} from './types/messages';

// ====== State ======
const projects = ref<ClaudeProject[]>([]);
const usage = reactive<UsageState>({
  kimi: null,
  minimax: null,
  copilot: null,
  enabled: {},
});

const isPinned = ref(true);
const isCompact = ref(true);
const lastUpdate = ref<number | null>(null);
const isRefreshing = ref(false);
const isUsageRefreshing = ref(false);

// 时间 tick，formatAge/ageClass 响应式依赖它
const now = ref(Date.now());

const isElectron = computed(() => !!window.electronAPI);

// ====== WebSocket ======
const { isConnected, connect, send } = useWebSocket(handleMessage);

function handleMessage(msg: WsMessage) {
  if (msg.type === 'init') {
    if (msg.data.claude) handleClaudeData(msg.data.claude);
    if (msg.data.usage) handleUsageInit(msg.data.usage);
  } else if (msg.type === 'statusChange' && msg.assistantId === 'claude') {
    handleClaudeData(msg.data);
  } else if (msg.type === 'usageInit') {
    handleUsageInit(msg.data);
  } else if (msg.type === 'usageUpdate') {
    handleUsageUpdate(msg);
  }
}

function handleClaudeData(data: AssistantStatus) {
  if (!data || !data.details) return;
  projects.value = data.details.projects ?? [];
  if (data.details.lastUpdate) {
    const ts = typeof data.details.lastUpdate === 'string'
      ? new Date(data.details.lastUpdate).getTime()
      : data.details.lastUpdate;
    lastUpdate.value = ts;
  } else if (typeof data.lastUpdate === 'number') {
    lastUpdate.value = data.lastUpdate;
  }
}

function handleUsageInit(payload: UsageInitPayload) {
  if (!payload) return;
  usage.kimi = payload.kimi ?? null;
  usage.minimax = payload.minimax ?? null;
  usage.copilot = payload.copilot ?? null;
  usage.enabled = payload.enabled ?? {};
}

function handleUsageUpdate(payload: UsageUpdatePayload) {
  if (!payload || !payload.provider) return;
  const provider = payload.provider as ProviderId;
  const prev = usage[provider] ?? {};
  usage[provider] = { ...prev, ...payload };
}

// ====== UI actions ======
function togglePin() {
  isPinned.value = !isPinned.value;
  if (isElectron.value) {
    window.electronAPI?.toggleAlwaysOnTop(isPinned.value);
  }
}

function minimize() {
  if (isElectron.value) {
    window.close();
  }
}

function onRefresh() {
  if (send({ type: 'refresh' })) {
    isRefreshing.value = true;
    setTimeout(() => { isRefreshing.value = false; }, 1000);
  }
}

function onUsageRefresh() {
  onRefresh();
  isUsageRefreshing.value = true;
  setTimeout(() => { isUsageRefreshing.value = false; }, 1000);
}

function toggleCompact() {
  isCompact.value = !isCompact.value;
}

// ====== Age timer ======
let ageTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  connect();
  ageTimer = setInterval(() => { now.value = Date.now(); }, 60_000);
});

onBeforeUnmount(() => {
  if (ageTimer) {
    clearInterval(ageTimer);
    ageTimer = null;
  }
  // WS 由 useWebSocket 自己在 onBeforeUnmount 关
});

// ====== Footer ======
const lastUpdateText = computed(() => {
  if (!lastUpdate.value) return '-';
  return `Last Update: ${new Date(lastUpdate.value).toLocaleTimeString()}`;
});
</script>

<template>
  <div class="app">
    <TitleBar :is-pinned="isPinned" :is-electron="isElectron" @toggle-pin="togglePin" @minimize="minimize" />

    <div class="cards-container">
      <ClaudeCard :projects="projects" :now="now" :is-refreshing="isRefreshing" @refresh="onRefresh" />
      <UsageCard :usage="usage" :now="now" :is-compact="isCompact" :is-refreshing="isUsageRefreshing"
                 @toggle-compact="toggleCompact" @refresh="onUsageRefresh" />
    </div>

    <div class="footer">
      <div class="connection-status" :class="{ disconnected: !isConnected }">
        <span class="dot"></span> {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
      <div class="last-update">{{ lastUpdateText }}</div>
    </div>
  </div>
</template>
