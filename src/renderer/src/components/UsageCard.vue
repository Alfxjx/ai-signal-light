<script setup lang="ts">
import { computed } from 'vue';
import type {
  UsageState,
  ProviderId,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
  UsageMetric,
} from '../types/messages';
import { formatAge, formatResetTime, barClass } from '../utils/time';

const props = defineProps<{
  usage: UsageState;
  now: number;
  isCompact: boolean;
  isRefreshing: boolean;
}>();

const emit = defineEmits<{
  toggleCompact: [];
  refresh: [];
}>();

// ---- 通用 helpers ----
function isProviderDisabled(provider: ProviderId): boolean {
  const state = props.usage[provider];
  if (!state) return true;
  const enabled = props.usage.enabled?.[provider];
  return enabled === false || state.error === 'disabled';
}

function showUsageBars(provider: ProviderId): boolean {
  const state = props.usage[provider];
  if (!state) return false;
  if (state.error === 'no_token' || state.error === 'disabled') return false;
  return true;
}

function usageStatusText(provider: ProviderId): string {
  const state = props.usage[provider];
  if (!state) return '—';
  if (state.error === 'disabled') return 'Disabled';
  if (state.error === 'no_token') return 'Not Configured';
  if (state.error) return 'Error';
  return 'OK';
}

function usageStatusClass(provider: ProviderId): string {
  const state = props.usage[provider];
  if (!state) return '';
  if (state.error === 'disabled') return 'disabled';
  if (state.error === 'no_token') return 'no_token';
  if (state.error) return 'error';
  return '';
}

// ---- Kimi 专用 ----
function kimiData(key: keyof KimiUsageData): UsageMetric | null {
  const d = props.usage.kimi?.data as KimiUsageData | undefined;
  return (d?.[key] as UsageMetric | undefined) ?? null;
}

function kimiText(key: keyof KimiUsageData): string {
  const d = kimiData(key);
  if (!d || !d.limit) return '—';
  return `${d.percent}%`;
}

function kimiPercent(key: keyof KimiUsageData): number {
  const d = kimiData(key);
  if (!d || !d.limit) return 0;
  return Math.max(0, Math.min(100, d.used ?? 0));
}

// ---- MiniMax 专用 ----
const minimaxData = computed<MinimaxUsageData | null>(() => {
  return (props.usage.minimax?.data as MinimaxUsageData | undefined) ?? null;
});

const minimaxFiveHourPercent = computed<number>(() => {
  if (!minimaxData.value) return 0;
  return Math.max(0, Math.min(100, 100 - (minimaxData.value.fiveHourPercent ?? 0)));
});

const minimaxWeeklyPercent = computed<number>(() => {
  if (!minimaxData.value) return 0;
  return Math.max(0, Math.min(100, 100 - (minimaxData.value.weeklyPercent ?? 0)));
});

const minimaxFiveHourText = computed<string>(() => {
  return `${minimaxData.value?.fiveHourPercent ?? 0}%`;
});

const minimaxWeeklyText = computed<string>(() => {
  return `${minimaxData.value?.weeklyPercent ?? 0}%`;
});

// ---- Copilot 专用 ----
const copilotData = computed<CopilotUsageData | null>(() => {
  return (props.usage.copilot?.data as CopilotUsageData | undefined) ?? null;
});

const copilotPremiumPercent = computed<number>(() => {
  // 服务端给的是「剩余 %」，bar 填充宽度直接用它（剩得少 = bar 窄）
  if (!copilotData.value?.premium?.limit) return 0;
  return Math.max(0, Math.min(100, copilotData.value.premium.percent ?? 0));
});

const copilotPremiumText = computed<string>(() => {
  const p = copilotData.value?.premium;
  if (!p || !p.limit) return '—';
  return `${p.remaining}/${p.limit}`;
});

const copilotResetDateText = computed<string>(() => {
  const d = copilotData.value?.premium?.resetDate;
  if (!d) return '';
  // "2026-07-01" → "07-01"
  return d.length >= 10 ? d.slice(5, 10) : d;
});
// ---- 卡片头 / 底部 ----
const usageLastTs = computed<number | null>(() => {
  const ks = [
    props.usage.kimi?.lastUpdated ?? null,
    props.usage.minimax?.lastUpdated ?? null,
    props.usage.copilot?.lastUpdated ?? null,
  ].filter((v) => v !== null).map(x=> new Date().getTime()) as number[];
  if (ks.length === 0) return null;
  return Math.max(...ks);
});

const allNoToken = computed<boolean>(() => {
  const kimiNoToken = props.usage.kimi?.error === 'no_token';
  const miniNoToken = props.usage.minimax?.error === 'no_token';
  const copilotNoToken = props.usage.copilot?.error === 'no_token';
  return kimiNoToken && miniNoToken && copilotNoToken;
});
</script>

<template>
  <div class="usage-card" data-assistant="usage">
    <div class="usage-header">
      <div class="header-left">
        <span class="usage-title">Usage</span>
        <span class="usage-updated" :data-ts="usageLastTs">{{ formatAge(usageLastTs, now) }}</span>
      </div>
      <div class="header-controls">
        <button class="btn-compact" :class="{ active: isCompact }"
                :title="isCompact ? '完整模式' : '简略模式'" @click="emit('toggleCompact')">≡</button>
        <button class="btn-refresh" :class="{ spinning: isRefreshing }" title="Refresh Now" @click="emit('refresh')">↻</button>
      </div>
    </div>

    <div class="usage-list" :class="{ compact: isCompact }">
      <!-- Kimi -->
      <div class="usage-row" v-if="!isProviderDisabled('kimi')" :data-disabled="String(isProviderDisabled('kimi'))" data-provider="kimi">
        <div class="usage-row-header">
          <span class="usage-name">Kimi</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('kimi')" :title="usage.kimi?.error || usageStatusText('kimi')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('kimi')">
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <span>all plan</span>
              <span class="usage-bar-value">{{ kimiText('total') }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('total') + '%' }" :class="barClass(kimiPercent('total'))"></div>
            </div>
          </div>
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <span>week</span>
              <span class="usage-bar-value">{{ kimiText('codingWeekly') }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('codingWeekly') + '%' }" :class="barClass(kimiPercent('codingWeekly'))"></div>
            </div>
          </div>
          <div class="usage-bar-block">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>5h</span>
                <div class="usage-bar-meta">{{ formatResetTime(kimiData('codingFiveHour')?.resetTime) }}</div>
              </div>
              <span class="usage-bar-value">{{ kimiText('codingFiveHour') }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('codingFiveHour') + '%' }" :class="barClass(kimiPercent('codingFiveHour'))"></div>
            </div>
          </div>
        </template>
      </div>

      

      <!-- MiniMax -->
      <div class="usage-row" v-if="!isProviderDisabled('minimax')" :data-disabled="String(isProviderDisabled('minimax'))" data-provider="minimax">
        <div class="usage-row-header">
          <span class="usage-name">MiniMax</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('minimax')" :title="usage.minimax?.error || usageStatusText('minimax')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('minimax')">
          <div class="usage-bar-block">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>5h</span>
                <div class="usage-bar-meta">{{ formatResetTime(minimaxData?.fiveHourResetTime) }}</div>
              </div>
              <span class="usage-bar-value">{{ minimaxFiveHourText }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: minimaxFiveHourPercent + '%' }" :class="barClass(minimaxFiveHourPercent)"></div>
            </div>
          </div>
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <span>week</span>
              <span class="usage-bar-value">{{ minimaxWeeklyText }}</span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: minimaxWeeklyPercent + '%' }" :class="barClass(minimaxWeeklyPercent)"></div>
            </div>
          </div>
        </template>
      </div>
    </div>


    <!-- Copilot -->
      <div class="usage-row" v-if="!isProviderDisabled('copilot')" :data-disabled="String(isProviderDisabled('copilot'))" data-provider="copilot">
        <div class="usage-row-header">
          <span class="usage-name">Copilot</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('copilot')" :title="usage.copilot?.error || usageStatusText('copilot')"></span>
          </div>
        </div>
        <div class="usage-bar-block" v-if="showUsageBars('copilot')">
          <div class="usage-bar-label">
            <div class="usage-time">
              <span>premium</span>
              <div class="usage-bar-meta" v-if="copilotResetDateText">Reset {{ copilotResetDateText }}</div>
            </div>
            <span class="usage-bar-value">{{ copilotPremiumText }}</span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill"
                 :style="{ width: copilotPremiumPercent + '%' }"
                 :class="barClass(100 - copilotPremiumPercent)"></div>
          </div>
        </div>
      </div>

    <div class="usage-empty" v-show="allNoToken">No token configured, set in tray menu</div>
  </div>
</template>
