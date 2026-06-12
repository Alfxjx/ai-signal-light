<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import TitleBar from './components/TitleBar.vue';
import ClaudeCard from './components/ClaudeCard.vue';
import UsageCard from './components/UsageCard.vue';
import { useWebSocket } from './composables/useWebSocket';
import { normalizeCwd } from './utils/cwd';
import type {
  ClaudeProject,
  UsageState,
  WsMessage,
  AssistantStatus,
  UsageInitPayload,
  UsageUpdatePayload,
  ProviderId,
  ClaudeHookPayload,
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

// hook 触发的"待用户响应"标记，key 为归一化后的 cwd
interface PendingHook { event: ClaudeHookPayload['event']; ts: number }
const pendingByCwd = reactive<Record<string, PendingHook>>({});

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
    handleClaudeData(msg.data as AssistantStatus);
  } else if (msg.type === 'usageInit') {
    handleUsageInit(msg.data);
  } else if (msg.type === 'usageUpdate') {
    handleUsageUpdate(msg);
  } else if (msg.type === 'claudeHook') {
    handleClaudeHook(msg);
  }
}

function handleClaudeHook(msg: ClaudeHookPayload) {
  const key = normalizeCwd(msg.cwd);
  if (!key) return; // 没有 cwd 无法定位项目，丢弃
  pendingByCwd[key] = { event: msg.event, ts: msg.ts };
}

function clearPending(cwd: string) {
  const key = normalizeCwd(cwd);
  if (key) {
    delete pendingByCwd[key];
    // 通知主进程广播给悬浮球（让指示灯同步熄灭）
    if (isElectron.value) {
      window.electronAPI?.floatingBall?.notifyCleared(key);
    }
  }
}

function handleClaudeData(data: AssistantStatus) {
  if (!data || !data.details) return;
  const newProjects = (data.details.projects ?? []) as ClaudeProject[];
  projects.value = newProjects;

  // 自动消除已过期的红点：项目的 lastResponse 比 pending 时间新 → 说明 claude 已经响应了
  for (const p of newProjects) {
    const key = normalizeCwd(p.cwd ?? null);
    if (!key) continue;
    const pending = pendingByCwd[key];
    if (!pending) continue;
    if (p.lastResponse) {
      const lastMs = typeof p.lastResponse === 'string'
        ? new Date(p.lastResponse).getTime()
        : p.lastResponse;
      if (!Number.isNaN(lastMs) && lastMs > pending.ts) {
        delete pendingByCwd[key];
      }
    }
  }

  if (data.details.lastUpdate) {
    const ts = typeof data.details.lastUpdate === 'string'
      ? new Date(data.details.lastUpdate).getTime()
      : data.details.lastUpdate;
    lastUpdate.value = ts;
  } else if (data.lastUpdate) {
    const ts = typeof data.lastUpdate === 'string'
      ? new Date(data.lastUpdate).getTime()
      : data.lastUpdate;
    if (!Number.isNaN(ts)) lastUpdate.value = ts;
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

function openSettings() {
  window.electronAPI?.openSettings();
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
  if (isElectron.value) {
    const newHeight = isCompact.value ? 380 : 550;
    window.electronAPI?.resizeWindow({ height: newHeight });
    window.electronAPI?.setCompact(isCompact.value);
  }
}

// ====== Age timer ======
let ageTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  connect();
  ageTimer = setInterval(() => { now.value = Date.now(); }, 60_000);
  // 同步主进程持久化的 isCompact，避免重启后 UI 模式跟窗口高度对不上
  if (isElectron.value) {
    window.electronAPI?.getWindowState().then((s) => {
      if (s && typeof s.isCompact === 'boolean') isCompact.value = s.isCompact;
    });
  }
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
    <TitleBar :is-pinned="isPinned" :is-electron="isElectron"
              @toggle-pin="togglePin" @minimize="minimize" @open-settings="openSettings" />

    <div class="cards-container">
      <UsageCard :usage="usage" :now="now" :is-compact="isCompact" :is-refreshing="isUsageRefreshing"
                 @toggle-compact="toggleCompact" @refresh="onUsageRefresh" />
      <ClaudeCard :projects="projects" :now="now" :is-refreshing="isRefreshing"
                  :pending-by-cwd="pendingByCwd" @refresh="onRefresh" @clear-pending="clearPending" />
    </div>

    <div class="footer">
      <div class="connection-status" :class="{ disconnected: !isConnected }">
        <span class="dot"></span> {{ isConnected ? 'Connected' : 'Disconnected' }}
      </div>
      <div class="last-update">{{ lastUpdateText }}</div>
    </div>
  </div>
</template>
