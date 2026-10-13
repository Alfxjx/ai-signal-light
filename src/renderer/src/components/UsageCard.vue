<script setup lang="ts">
import { computed } from 'vue';
import { Rows3, RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import type {
  UsageState,
  ProviderId,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
  DeepseekUsageData,
  CodexUsageData,
  CodexWindowData,
  VolcengineUsageData,
  MimoUsageData,
  UsageMetric,
} from '../types/messages';
import { formatAge, formatResetTime, barClass } from '../utils/time';
import { paceText, paceArrow, calcUsagePace, type UsagePaceResult } from '../utils/usage';

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
const WINDOW_MONTH_MS = 30 * 24 * 60 * 60 * 1000; // 一个月按 30 天

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

// 状态圆点 / pace 徽章着色（走 CSS 变量，背景用 color-mix 柔和化）
function paceClass(pace: 'fast' | 'slow' | 'average' | null): string {
  if (pace === 'fast') return 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)]';
  if (pace === 'slow') return 'bg-[color-mix(in_srgb,var(--fresh)_15%,transparent)] text-[var(--fresh)]';
  if (pace === 'average') return 'bg-muted/50 text-muted-foreground/70';
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
  if (!state) return 'bg-[var(--fresh)]';
  if (state.error === 'disabled') return 'bg-foreground/25';
  if (state.error === 'no_token') return 'bg-[var(--warn)]';
  if (state.error) return 'bg-[var(--danger)]';
  return 'bg-[var(--fresh)]';
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

// ---- MiMo 专用（余额型，同 DeepSeek）----
const mimoData = computed<MimoUsageData | null>(() => {
  return (props.usage.mimo?.data as MimoUsageData | undefined) ?? null;
});

const mimoBalanceText = computed<string>(() => {
  const d = mimoData.value;
  if (!d) return '—';
  const symbol = d.currency === 'CNY' ? '¥' : d.currency === 'USD' ? '$' : (d.currency ? d.currency + ' ' : '');
  return `${symbol}${d.totalBalance.toFixed(2)}`;
});

const mimoGrantedText = computed<string>(() => {
  const d = mimoData.value;
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
// ---- Volcengine 专用 ----
const volcengineData = computed<VolcengineUsageData | null>(() => {
  return (props.usage.volcengine?.data as VolcengineUsageData | undefined) ?? null;
});
function volcengineMetric(key: keyof VolcengineUsageData): UsageMetric | null {
  const d = volcengineData.value;
  return (d?.[key] as UsageMetric | undefined) ?? null;
}
function volcenginePercent(key: keyof VolcengineUsageData): number {
  const m = volcengineMetric(key);
  if (!m || !m.limit) return 0;
  return Math.max(0, Math.min(100, m.percent ?? 0));
}
function volcengineText(key: keyof VolcengineUsageData): string {
  const m = volcengineMetric(key);
  if (!m || !m.limit) return '—';
  return `${m.percent}%`;
}
// 火山 pacing：session=5h、weekly=7d、monthly=一个月(30天)（用户确认的窗口时长）
const volcengineSessionPace = computed<UsagePaceResult>(() =>
  slotPace(volcenginePercent('session'), volcengineMetric('session')?.resetTime, WINDOW_5H_MS)
);
const volcengineWeeklyPace = computed<UsagePaceResult>(() =>
  slotPace(volcenginePercent('weekly'), volcengineMetric('weekly')?.resetTime, WINDOW_WEEK_MS)
);
const volcengineMonthlyPace = computed<UsagePaceResult>(() =>
  slotPace(volcenginePercent('monthly'), volcengineMetric('monthly')?.resetTime, WINDOW_MONTH_MS)
);
// ---- 卡片头 / 底部 ----
const usageLastTs = computed<number | null>(() => {
  const ks = ([
    props.usage.kimi?.lastUpdated,
    props.usage.minimax?.lastUpdated,
    props.usage.copilot?.lastUpdated,
    props.usage.deepseek?.lastUpdated,
    props.usage.codex?.lastUpdated,
    props.usage.volcengine?.lastUpdated,
    props.usage.mimo?.lastUpdated,
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
  const volcengineNoToken = props.usage.volcengine?.error === 'no_token';
  const mimoNoToken = props.usage.mimo?.error === 'no_token';
  return kimiNoToken && miniNoToken && copilotNoToken && deepseekNoToken && codexNoToken && volcengineNoToken && mimoNoToken;
});
</script>

<template>
  <div data-assistant="usage" class="py-2">
    <div class="mb-2 flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium text-foreground/85">Usage</span>
        <span class="text-[11px] tabular-nums text-muted-foreground/70" :data-ts="usageLastTs">{{ formatAge(usageLastTs, now) }}</span>
      </div>
      <div class="no-drag flex items-center gap-1.5">
        <Button variant="ghost" size="icon" class="h-6 w-6" :title="isCompact ? '完整模式' : '简略模式'"
          @click="emit('toggleCompact')">
          <Rows3 :class="{ 'text-[var(--fresh)]': isCompact }" />
        </Button>
        <Button variant="ghost" size="icon" class="h-6 w-6" title="Refresh Now"
          @click="emit('refresh')">
          <RefreshCw :class="{ 'animate-spin': isRefreshing }" />
        </Button>
      </div>
    </div>

    <div class="divide-y divide-border/60 rounded-lg border bg-muted/40 py-1">
      <!-- Kimi -->
      <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('kimi')" :data-disabled="String(isProviderDisabled('kimi'))"
        data-provider="kimi">
        <div class="mb-1.5 flex items-center gap-1.5">
          <span class="text-[13px] font-medium text-foreground/85">Kimi</span>
          <div class="flex h-[17px] items-center">
            <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('kimi')"
              :title="usage.kimi?.error || usageStatusText('kimi')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('kimi')">
          <div class="mt-1.5" :class="{ hidden: isCompact }">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>week</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(kimiData('codingWeekly')?.resetTime) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ kimiText('codingWeekly') }}
                <span v-if="kimiWeeklyPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                  :class="paceClass(kimiWeeklyPace.pace)"
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
          <div class="mt-1.5">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>5h</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(kimiData('codingFiveHour')?.resetTime) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ kimiText('codingFiveHour') }}
                <span v-if="kimiFiveHourPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                  :class="paceClass(kimiFiveHourPace.pace)"
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
      <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('minimax')"
        :data-disabled="String(isProviderDisabled('minimax'))" data-provider="minimax">
        <div class="mb-1.5 flex items-center gap-1.5">
          <span class="text-[13px] font-medium text-foreground/85">MiniMax</span>
          <div class="flex h-[17px] items-center">
            <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('minimax')"
              :title="usage.minimax?.error || usageStatusText('minimax')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('minimax')">
          <div class="mt-1.5">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>5h</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(minimaxData?.fiveHourResetTime, true) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ minimaxFiveHourText }}
                <span v-if="minimaxFiveHourPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                  :class="paceClass(minimaxFiveHourPace.pace)"
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
          <div class="mt-1.5" :class="{ hidden: isCompact }">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>week</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60" v-if="minimaxData?.weeklyResetTime">{{
                  formatResetTime(minimaxData.weeklyResetTime, true) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ minimaxWeeklyText }}
                <span v-if="minimaxWeeklyPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                  :class="paceClass(minimaxWeeklyPace.pace)"
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
      <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('deepseek')"
        :data-disabled="String(isProviderDisabled('deepseek'))" data-provider="deepseek">
        <div class="mb-1.5 flex items-center gap-1.5">
          <span class="text-[13px] font-medium text-foreground/85">DeepSeek</span>
          <div class="flex h-[17px] items-center">
            <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('deepseek')"
              :title="usage.deepseek?.error || usageStatusText('deepseek')"></span>
          </div>
        </div>
        <div class="mt-1.5" v-if="showUsageBars('deepseek')">
          <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>balance</span>
            <span class="usage-bar-value tabular-nums text-foreground/85">{{ deepseekBalanceText }}</span>
          </div>
          <div class="text-[10px] tabular-nums text-muted-foreground/60" v-if="deepseekGrantedText">{{ deepseekGrantedText }}</div>
        </div>
      </div>

      <!-- MiMo -->
      <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('mimo')"
        :data-disabled="String(isProviderDisabled('mimo'))" data-provider="mimo">
        <div class="mb-1.5 flex items-center gap-1.5">
          <span class="text-[13px] font-medium text-foreground/85">MiMo</span>
          <div class="flex h-[17px] items-center">
            <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('mimo')"
              :title="usage.mimo?.error || usageStatusText('mimo')"></span>
          </div>
        </div>
        <div class="mt-1.5" v-if="showUsageBars('mimo')">
          <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>balance</span>
            <span class="usage-bar-value tabular-nums text-foreground/85">{{ mimoBalanceText }}</span>
          </div>
          <div class="text-[10px] tabular-nums text-muted-foreground/60" v-if="mimoGrantedText">{{ mimoGrantedText }}</div>
        </div>
      </div>

      <!-- Codex -->
      <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('codex')"
        :data-disabled="String(isProviderDisabled('codex'))" data-provider="codex">
        <div class="mb-1.5 flex items-center gap-1.5">
          <span class="text-[13px] font-medium text-foreground/85">Codex<span v-if="codexData?.planType" class="ml-2 text-[10px] tabular-nums text-muted-foreground/60"> {{ codexData.planType }}</span></span>
          <div class="flex h-[17px] items-center">
            <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('codex')"
              :title="usage.codex?.error || usageStatusText('codex')"></span>
          </div>
        </div>
        <template v-if="showUsageBars('codex')">
          <div class="mt-1.5" v-if="codexData?.primary">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>{{ codexWindowLabel(codexData.primary.windowSeconds) }}</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60" v-if="codexData.primary.resetAt">{{ formatResetTime(codexData.primary.resetAt * 1000) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ codexWindowText(codexData.primary) }}
                <span v-if="codexPrimaryPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
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
          <div class="mt-1.5" v-if="codexData?.secondary" :class="{ hidden: isCompact }">
            <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <div class="flex items-center gap-0.5">
                <span>{{ codexWindowLabel(codexData.secondary.windowSeconds) }}</span>
                <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60" v-if="codexData.secondary.resetAt">{{ formatResetTime(codexData.secondary.resetAt * 1000) }}</span>
              </div>
              <span class="usage-bar-value tabular-nums text-foreground/85">{{ codexWindowText(codexData.secondary) }}
                <span v-if="codexSecondaryPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
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

    <!-- Copilot -->
    <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('copilot')" :data-disabled="String(isProviderDisabled('copilot'))"
      data-provider="copilot">
      <div class="mb-1.5 flex items-center gap-1.5">
        <span class="text-[13px] font-medium text-foreground/85">Copilot</span>
        <div class="flex h-[17px] items-center">
          <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('copilot')"
            :title="usage.copilot?.error || usageStatusText('copilot')"></span>
        </div>
      </div>
      <div class="mt-1.5" v-if="showUsageBars('copilot')">
        <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <div class="flex items-center gap-0.5">
            <span>premium</span>
            <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60" v-if="copilotResetDateText">Reset {{ copilotResetDateText }}</span>
          </div>
          <span class="usage-bar-value tabular-nums text-foreground/85">{{ copilotPremiumText }}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-bar-fill" :style="{ width: copilotPremiumPercent + '%' }"
            :class="barClass(copilotPremiumPercent, usage.thresholds)"></div>
        </div>
      </div>
    </div>

    <!-- Volcengine -->
    <div class="usage-row px-1.5 py-1" v-if="!isProviderDisabled('volcengine')"
      :data-disabled="String(isProviderDisabled('volcengine'))" data-provider="volcengine">
      <div class="mb-1.5 flex items-center gap-1.5">
        <span class="text-[13px] font-medium text-foreground/85">Ark Coding Plan</span>
        <div class="flex h-[17px] items-center">
          <span class="h-[7px] w-[7px] shrink-0 rounded-full" :class="usageStatusClass('volcengine')"
            :title="usage.volcengine?.error || usageStatusText('volcengine')"></span>
        </div>
      </div>
      <template v-if="showUsageBars('volcengine')">
        <div class="mt-1.5">
          <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <div class="flex items-center gap-0.5">
              <span>session</span>
              <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(volcengineMetric('session')?.resetTime) }}</span>
            </div>
            <span class="usage-bar-value tabular-nums text-foreground/85">{{ volcengineText('session') }}
              <span v-if="volcengineSessionPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                :class="paceClass(volcengineSessionPace.pace)"
                :title="paceTooltip(volcengineSessionPace.pace, volcengineSessionPace.delta)">
                {{ paceText(volcengineSessionPace.pace) }}{{ paceArrow(volcengineSessionPace.pace) }}
              </span>
            </span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill" :style="{ width: volcenginePercent('session') + '%' }"
              :class="barClass(volcenginePercent('session'), usage.thresholds)"></div>
            <div v-if="volcengineSessionPace.expectedPercent != null" class="usage-bar-marker"
              :style="{ left: volcengineSessionPace.expectedPercent + '%' }"
              :title="`平均消耗 ${volcengineSessionPace.expectedPercent.toFixed(1)}%`"></div>
          </div>
        </div>
        <div class="mt-1.5">
          <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <div class="flex items-center gap-0.5">
              <span>weekly</span>
              <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(volcengineMetric('weekly')?.resetTime) }}</span>
            </div>
            <span class="usage-bar-value tabular-nums text-foreground/85">{{ volcengineText('weekly') }}
              <span v-if="volcengineWeeklyPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                :class="paceClass(volcengineWeeklyPace.pace)"
                :title="paceTooltip(volcengineWeeklyPace.pace, volcengineWeeklyPace.delta)">
                {{ paceText(volcengineWeeklyPace.pace) }}{{ paceArrow(volcengineWeeklyPace.pace) }}
              </span>
            </span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill" :style="{ width: volcenginePercent('weekly') + '%' }"
              :class="barClass(volcenginePercent('weekly'), usage.thresholds)"></div>
            <div v-if="volcengineWeeklyPace.expectedPercent != null" class="usage-bar-marker"
              :style="{ left: volcengineWeeklyPace.expectedPercent + '%' }"
              :title="`平均消耗 ${volcengineWeeklyPace.expectedPercent.toFixed(1)}%`"></div>
          </div>
        </div>
        <div class="mt-1.5">
          <div class="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <div class="flex items-center gap-0.5">
              <span>monthly</span>
              <span class="ml-2 text-[10px] tabular-nums text-muted-foreground/60">{{ formatResetTime(volcengineMetric('monthly')?.resetTime) }}</span>
            </div>
            <span class="usage-bar-value tabular-nums text-foreground/85">{{ volcengineText('monthly') }}
              <span v-if="volcengineMonthlyPace.pace" class="ml-1.5 inline-flex items-center rounded-[3px] px-1 text-[9px] font-medium leading-none"
                :class="paceClass(volcengineMonthlyPace.pace)"
                :title="paceTooltip(volcengineMonthlyPace.pace, volcengineMonthlyPace.delta)">
                {{ paceText(volcengineMonthlyPace.pace) }}{{ paceArrow(volcengineMonthlyPace.pace) }}
              </span>
            </span>
          </div>
          <div class="usage-bar">
            <div class="usage-bar-fill" :style="{ width: volcenginePercent('monthly') + '%' }"
              :class="barClass(volcenginePercent('monthly'), usage.thresholds)"></div>
            <div v-if="volcengineMonthlyPace.expectedPercent != null" class="usage-bar-marker"
              :style="{ left: volcengineMonthlyPace.expectedPercent + '%' }"
              :title="`平均消耗 ${volcengineMonthlyPace.expectedPercent.toFixed(1)}%`"></div>
          </div>
        </div>
      </template>
    </div>
    </div>

    <div class="px-2 py-2 text-center text-xs text-muted-foreground" v-show="allNoToken">No token configured, set in tray menu</div>
  </div>
</template>
