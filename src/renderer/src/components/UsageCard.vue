<script setup lang="ts">
import { computed } from 'vue';
import type {
  UsageState,
  ProviderId,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
  DeepseekUsageData,
  CodexUsageData,
  CodexWindowData,
  UsageMetric,
} from '../types/messages';
import { formatAge, formatResetTime, barClass } from '../utils/time';
import { paceText, paceArrow, calcUsagePace, inferAllPlanWindowMs, type UsagePaceResult } from '../utils/usage';

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

const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
const WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseResetMs(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0 && n < 365 * 24 * 60 * 60 * 1000) {
    // 相对毫秒数
    return Date.now() + n;
  }
  if (!Number.isNaN(n)) return n;
  const d = new Date(raw as string);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function slotPace(usedPercent: number, resetRaw: string | number | null | undefined, windowMs: number): UsagePaceResult {
  return calcUsagePace(usedPercent, parseResetMs(resetRaw), windowMs, props.now);
}

function paceClass(pace: 'fast' | 'slow' | 'average' | null): string {
  if (pace === 'fast') return 'pace-fast';
  if (pace === 'slow') return 'pace-slow';
  if (pace === 'average') return 'pace-average';
  return '';
}

function paceTooltip(pace: 'fast' | 'slow' | 'average' | null, delta: number | null): string {
  if (!pace || delta === null) return '';
  const sign = delta > 0 ? '+' : '';
  const desc = pace === 'fast' ? '比平均消耗快' : pace === 'slow' ? '比平均消耗慢' : '与平均消耗持平';
  return `${desc} ${sign}${delta.toFixed(1)}%`;
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
  return `${d.percent.toFixed(2)}%`;
}

function kimiPercent(key: keyof KimiUsageData): number {
  const d = kimiData(key);
  if (!d || !d.limit) return 0;
  // 统一显示"已用 %"（main 进程已翻转）
  return Math.max(0, Math.min(100, d.percent ?? 0));
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
  return `${minimaxFiveHourPercent.value}%`;
});

const minimaxWeeklyText = computed<string>(() => {
  return `${minimaxWeeklyPercent.value}%`;
});

// ---- Pace（消耗节奏）：仅 5h / 周窗口根据重置时间计算 ----
const kimiFiveHourPace = computed<UsagePaceResult>(() =>
  slotPace(kimiPercent('codingFiveHour'), kimiData('codingFiveHour')?.resetTime, WINDOW_5H_MS)
);
const kimiWeeklyPace = computed<UsagePaceResult>(() =>
  slotPace(kimiPercent('codingWeekly'), kimiData('codingWeekly')?.resetTime, WINDOW_WEEK_MS)
);
const minimaxFiveHourPace = computed<UsagePaceResult>(() =>
  slotPace(minimaxFiveHourPercent.value, minimaxData.value?.fiveHourResetTime, WINDOW_5H_MS)
);
const minimaxWeeklyPace = computed<UsagePaceResult>(() =>
  slotPace(minimaxWeeklyPercent.value, minimaxData.value?.weeklyResetTime, WINDOW_WEEK_MS)
);
const kimiTotalPace = computed<UsagePaceResult>(() => {
  const used = kimiPercent('total');
  const resetMs = parseResetMs(kimiData('total')?.resetTime);
  const windowMs = resetMs ? inferAllPlanWindowMs(resetMs, props.now) : null;
  if (!windowMs) return { pace: null, delta: null, expectedPercent: null };
  return slotPace(used, resetMs, windowMs);
});
function codexPace(w: CodexWindowData | null): UsagePaceResult {
  if (!w) return { pace: null, delta: null, expectedPercent: null };
  const windowMs = w.windowSeconds * 1000;
  const isPaceWindow = windowMs <= WINDOW_5H_MS + 60 * 1000 || windowMs > 24 * 60 * 60 * 1000;
  if (!isPaceWindow) return { pace: null, delta: null, expectedPercent: null };
  return slotPace(codexWindowPercent(w), w.resetAt ? w.resetAt * 1000 : null, windowMs);
}

const codexPrimaryPace = computed<UsagePaceResult>(() => codexPace(codexData.value?.primary ?? null));
const codexSecondaryPace = computed<UsagePaceResult>(() => codexPace(codexData.value?.secondary ?? null));

// ---- Copilot 专用 ----
const copilotData = computed<CopilotUsageData | null>(() => {
  return (props.usage.copilot?.data as CopilotUsageData | undefined) ?? null;
});

const copilotPremiumPercent = computed<number>(() => {
  // main 进程已把 percent 翻成「已用 %」，bar 填充宽度直接用
  if (!copilotData.value?.premium?.limit) return 0;
  return Math.max(0, Math.min(100, copilotData.value.premium.percent ?? 0));
});

const copilotPremiumText = computed<string>(() => {
  const p = copilotData.value?.premium;
  if (!p || !p.limit) return '—';
  return `${p.percent}%`;
});

const copilotResetDateText = computed<string>(() => {
  const d = copilotData.value?.premium?.resetDate;
  if (!d) return '';
  // "2026-07-01" → "07-01"
  return d.length >= 10 ? d.slice(5, 10) : d;
});

// ---- DeepSeek 专用 ----
const deepseekData = computed<DeepseekUsageData | null>(() => {
  return (props.usage.deepseek?.data as DeepseekUsageData | undefined) ?? null;
});

const deepseekBalanceText = computed<string>(() => {
  const d = deepseekData.value;
  if (!d) return '—';
  const symbol = d.currency === 'CNY' ? '¥' : d.currency === 'USD' ? '$' : (d.currency ? d.currency + ' ' : '');
  return `${symbol}${d.totalBalance.toFixed(2)}`;
});

const deepseekGrantedText = computed<string>(() => {
  const d = deepseekData.value;
  if (!d || !d.grantedBalance) return '';
  return `含赠送 ${d.grantedBalance.toFixed(2)}`;
});

// ---- Codex 专用 ----
const codexData = computed<CodexUsageData | null>(() => {
  return (props.usage.codex?.data as CodexUsageData | undefined) ?? null;
});

function codexWindowLabel(seconds: number): string {
  if (seconds <= 5 * 3600 + 60) return '5h';
  if (seconds <= 24 * 3600 + 60) return 'day';
  return 'week';
}

function codexWindowPercent(w: CodexWindowData | null): number {
  if (!w) return 0;
  return Math.max(0, Math.min(100, w.usedPercent ?? 0));
}

function codexWindowText(w: CodexWindowData | null): string {
  if (!w) return '—';
  return `${codexWindowPercent(w)}%`;
}
// ---- 卡片头 / 底部 ----
const usageLastTs = computed<number | null>(() => {
  const ks = ([
    props.usage.kimi?.lastUpdated,
    props.usage.minimax?.lastUpdated,
    props.usage.copilot?.lastUpdated,
    props.usage.deepseek?.lastUpdated,
    props.usage.codex?.lastUpdated,
  ].filter((v): v is string => typeof v === 'string')
    .map((v) => new Date(v).getTime())
    .filter((t) => !Number.isNaN(t))) as number[];
  if (ks.length === 0) return null;
  return Math.max(...ks);
});

const allNoToken = computed<boolean>(() => {
  const kimiNoToken = props.usage.kimi?.error === 'no_token';
  const miniNoToken = props.usage.minimax?.error === 'no_token';
  const copilotNoToken = props.usage.copilot?.error === 'no_token';
  const deepseekNoToken = props.usage.deepseek?.error === 'no_token';
  const codexNoToken = props.usage.codex?.error === 'no_token';
  return kimiNoToken && miniNoToken && copilotNoToken && deepseekNoToken && codexNoToken;
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
        <button class="btn-compact" :class="{ active: isCompact }" :title="isCompact ? '完整模式' : '简略模式'"
          @click="emit('toggleCompact')">≡</button>
        <button class="btn-refresh" :class="{ spinning: isRefreshing }" title="Refresh Now"
          @click="emit('refresh')">↻</button>
      </div>
    </div>

    <div class="usage-list" :class="{ compact: isCompact }">
      <!-- Kimi -->
      <div class="usage-row" v-if="!isProviderDisabled('kimi')" :data-disabled="String(isProviderDisabled('kimi'))"
        data-provider="kimi">
        <div class="usage-row-header">
          <span class="usage-name">Kimi</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('kimi')"
              :title="usage.kimi?.error || usageStatusText('kimi')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('kimi')">
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>all plan</span>
                <div class="usage-bar-meta">{{ formatResetTime(kimiData('total')?.resetTime) }}</div>
              </div>
              <span class="usage-bar-value">{{ kimiText('total') }}
                <span v-if="kimiTotalPace.pace" class="usage-pace" :class="paceClass(kimiTotalPace.pace)"
                  :title="paceTooltip(kimiTotalPace.pace, kimiTotalPace.delta)">
                  {{ paceText(kimiTotalPace.pace) }}{{ paceArrow(kimiTotalPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('total') + '%' }"
                :class="barClass(kimiPercent('total'), usage.thresholds)"></div>
              <div v-if="kimiTotalPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: kimiTotalPace.expectedPercent + '%' }"
                :title="`平均消耗 ${kimiTotalPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>week</span>
                <div class="usage-bar-meta">{{ formatResetTime(kimiData('codingWeekly')?.resetTime) }}</div>
              </div>
              <span class="usage-bar-value">{{ kimiText('codingWeekly') }}
                <span v-if="kimiWeeklyPace.pace" class="usage-pace" :class="paceClass(kimiWeeklyPace.pace)"
                  :title="paceTooltip(kimiWeeklyPace.pace, kimiWeeklyPace.delta)">
                  {{ paceText(kimiWeeklyPace.pace) }}{{ paceArrow(kimiWeeklyPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('codingWeekly') + '%' }"
                :class="barClass(kimiPercent('codingWeekly'), usage.thresholds)"></div>
              <div v-if="kimiWeeklyPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: kimiWeeklyPace.expectedPercent + '%' }"
                :title="`平均消耗 ${kimiWeeklyPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
          <div class="usage-bar-block">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>5h</span>
                <div class="usage-bar-meta">{{ formatResetTime(kimiData('codingFiveHour')?.resetTime) }}</div>
              </div>
              <span class="usage-bar-value">{{ kimiText('codingFiveHour') }}
                <span v-if="kimiFiveHourPace.pace" class="usage-pace" :class="paceClass(kimiFiveHourPace.pace)"
                  :title="paceTooltip(kimiFiveHourPace.pace, kimiFiveHourPace.delta)">
                  {{ paceText(kimiFiveHourPace.pace) }}{{ paceArrow(kimiFiveHourPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: kimiPercent('codingFiveHour') + '%' }"
                :class="barClass(kimiPercent('codingFiveHour'), usage.thresholds)"></div>
              <div v-if="kimiFiveHourPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: kimiFiveHourPace.expectedPercent + '%' }"
                :title="`平均消耗 ${kimiFiveHourPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
        </template>
      </div>



      <!-- MiniMax -->
      <div class="usage-row" v-if="!isProviderDisabled('minimax')"
        :data-disabled="String(isProviderDisabled('minimax'))" data-provider="minimax">
        <div class="usage-row-header">
          <span class="usage-name">MiniMax</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('minimax')"
              :title="usage.minimax?.error || usageStatusText('minimax')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('minimax')">
          <div class="usage-bar-block">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>5h</span>
                <div class="usage-bar-meta">{{ formatResetTime(minimaxData?.fiveHourResetTime, true) }}</div>
              </div>
              <span class="usage-bar-value">{{ minimaxFiveHourText }}
                <span v-if="minimaxFiveHourPace.pace" class="usage-pace" :class="paceClass(minimaxFiveHourPace.pace)"
                  :title="paceTooltip(minimaxFiveHourPace.pace, minimaxFiveHourPace.delta)">
                  {{ paceText(minimaxFiveHourPace.pace) }}{{ paceArrow(minimaxFiveHourPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: minimaxFiveHourPercent + '%' }"
                :class="barClass(minimaxFiveHourPercent, usage.thresholds)"></div>
              <div v-if="minimaxFiveHourPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: minimaxFiveHourPace.expectedPercent + '%' }"
                :title="`平均消耗 ${minimaxFiveHourPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
          <div class="usage-bar-block" data-hide-compact>
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>week</span>
                <div class="usage-bar-meta" v-if="minimaxData?.weeklyResetTime">{{
                  formatResetTime(minimaxData.weeklyResetTime, true) }}</div>
              </div>
              <span class="usage-bar-value">{{ minimaxWeeklyText }}
                <span v-if="minimaxWeeklyPace.pace" class="usage-pace" :class="paceClass(minimaxWeeklyPace.pace)"
                  :title="paceTooltip(minimaxWeeklyPace.pace, minimaxWeeklyPace.delta)">
                  {{ paceText(minimaxWeeklyPace.pace) }}{{ paceArrow(minimaxWeeklyPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: minimaxWeeklyPercent + '%' }"
                :class="barClass(minimaxWeeklyPercent, usage.thresholds)"></div>
              <div v-if="minimaxWeeklyPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: minimaxWeeklyPace.expectedPercent + '%' }"
                :title="`平均消耗 ${minimaxWeeklyPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
        </template>
      </div>

      <!-- DeepSeek -->
      <div class="usage-row" v-if="!isProviderDisabled('deepseek')"
        :data-disabled="String(isProviderDisabled('deepseek'))" data-provider="deepseek">
        <div class="usage-row-header">
          <span class="usage-name">DeepSeek</span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('deepseek')"
              :title="usage.deepseek?.error || usageStatusText('deepseek')"></span>
          </div>
        </div>
        <div class="usage-bar-block" v-if="showUsageBars('deepseek')">
          <div class="usage-bar-label">
            <span>balance</span>
            <span class="usage-bar-value">{{ deepseekBalanceText }}</span>
          </div>
          <div class="usage-bar-meta" v-if="deepseekGrantedText">{{ deepseekGrantedText }}</div>
        </div>
      </div>

      <!-- Codex -->
      <div class="usage-row" v-if="!isProviderDisabled('codex')"
        :data-disabled="String(isProviderDisabled('codex'))" data-provider="codex">
        <div class="usage-row-header">
          <span class="usage-name">Codex<span v-if="codexData?.planType" class="usage-bar-meta"> {{ codexData.planType }}</span></span>
          <div class="usage-status-wrapper">
            <span class="usage-status" :class="usageStatusClass('codex')"
              :title="usage.codex?.error || usageStatusText('codex')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('codex')">
          <div class="usage-bar-block" v-if="codexData?.primary">
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>{{ codexWindowLabel(codexData.primary.windowSeconds) }}</span>
                <div class="usage-bar-meta" v-if="codexData.primary.resetAt">{{ formatResetTime(codexData.primary.resetAt * 1000) }}</div>
              </div>
              <span class="usage-bar-value">{{ codexWindowText(codexData.primary) }}
                <span v-if="codexPrimaryPace.pace" class="usage-pace"
                  :class="paceClass(codexPrimaryPace.pace)"
                  :title="paceTooltip(codexPrimaryPace.pace, codexPrimaryPace.delta)">
                  {{ paceText(codexPrimaryPace.pace) }}{{ paceArrow(codexPrimaryPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: codexWindowPercent(codexData.primary) + '%' }"
                :class="barClass(codexWindowPercent(codexData.primary), usage.thresholds)"></div>
              <div v-if="codexPrimaryPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: codexPrimaryPace.expectedPercent + '%' }"
                :title="`平均消耗 ${codexPrimaryPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
          <div class="usage-bar-block" v-if="codexData?.secondary" data-hide-compact>
            <div class="usage-bar-label">
              <div class="usage-time">
                <span>{{ codexWindowLabel(codexData.secondary.windowSeconds) }}</span>
                <div class="usage-bar-meta" v-if="codexData.secondary.resetAt">{{ formatResetTime(codexData.secondary.resetAt * 1000) }}</div>
              </div>
              <span class="usage-bar-value">{{ codexWindowText(codexData.secondary) }}
                <span v-if="codexSecondaryPace.pace" class="usage-pace"
                  :class="paceClass(codexSecondaryPace.pace)"
                  :title="paceTooltip(codexSecondaryPace.pace, codexSecondaryPace.delta)">
                  {{ paceText(codexSecondaryPace.pace) }}{{ paceArrow(codexSecondaryPace.pace) }}
                </span>
              </span>
            </div>
            <div class="usage-bar">
              <div class="usage-bar-fill" :style="{ width: codexWindowPercent(codexData.secondary) + '%' }"
                :class="barClass(codexWindowPercent(codexData.secondary), usage.thresholds)"></div>
              <div v-if="codexSecondaryPace.expectedPercent != null" class="usage-bar-marker"
                :style="{ left: codexSecondaryPace.expectedPercent + '%' }"
                :title="`平均消耗 ${codexSecondaryPace.expectedPercent.toFixed(1)}%`"></div>
            </div>
          </div>
        </template>
      </div>
    </div>


    <!-- Copilot -->
    <div class="usage-row" v-if="!isProviderDisabled('copilot')" :data-disabled="String(isProviderDisabled('copilot'))"
      data-provider="copilot">
      <div class="usage-row-header">
        <span class="usage-name">Copilot</span>
        <div class="usage-status-wrapper">
          <span class="usage-status" :class="usageStatusClass('copilot')"
            :title="usage.copilot?.error || usageStatusText('copilot')"></span>
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
          <div class="usage-bar-fill" :style="{ width: copilotPremiumPercent + '%' }"
            :class="barClass(copilotPremiumPercent, usage.thresholds)"></div>
        </div>
      </div>
    </div>

    <div class="usage-empty" v-show="allNoToken">No token configured, set in tray menu</div>
  </div>
</template>
