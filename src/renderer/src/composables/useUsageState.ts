// 悬浮球和主窗口共用的 usage + pending 状态 composable。
// 主进程 statusServer 维护 pendingByCwd，通过 WsMessage 广播
// （init 消息捎带初始快照；claudeHook 触发后广播 pendingChanged）。
// 渲染层两个窗口各自消费同一份 WS 流，得到独立的响应式副本。

import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useWebSocket } from './useWebSocket';
import type {
  WsMessage,
  PendingHook,
  UsageProviderState,
  KimiUsageData,
  MinimaxUsageData,
  CopilotUsageData,
} from '../types/messages';

export interface FiveHourSlot {
  /** 剩余百分比 0-100（用于填充 mini bar） */
  percent: number;
  /** 5h 周期绝对 reset 时间，可能为 null */
  resetTime: Date | string | number | null;
  /** "Reset in 2h 14m" 文本，空表示没有 reset 概念 */
  resetText: string;
  /** "fresh" | "warn" | "danger" —— barClass 三档 */
  level: 'fresh' | 'warn' | 'danger' | 'muted';
}

export function useUsageState() {
  const kimi = ref<UsageProviderState | null>(null);
  const minimax = ref<UsageProviderState | null>(null);
  const copilot = ref<UsageProviderState | null>(null);
  const enabled = reactive<Record<string, boolean>>({});
  const pendingByCwd = reactive<Record<string, PendingHook>>({});

  // 1s tick 用于 5h 倒计时秒级刷新
  const now = ref<number>(Date.now());
  let nowTimer: ReturnType<typeof setInterval> | null = null;

  function handleMessage(msg: WsMessage) {
    if (msg.type === 'init') {
      if (msg.data.usage) {
        if (msg.data.usage.kimi)    kimi.value    = msg.data.usage.kimi;
        if (msg.data.usage.minimax) minimax.value = msg.data.usage.minimax;
        if (msg.data.usage.copilot) copilot.value = msg.data.usage.copilot;
        const en = msg.data.usage.enabled;
        if (en) {
          for (const k of Object.keys(en)) enabled[k] = !!en[k];
        }
      }
      // init 消息里捎带 pending 初始快照
      if (msg.data.pending) {
        for (const k of Object.keys(pendingByCwd)) delete pendingByCwd[k];
        Object.assign(pendingByCwd, msg.data.pending);
      }
    } else if (msg.type === 'usageInit') {
      if (msg.data.kimi)    kimi.value    = msg.data.kimi;
      if (msg.data.minimax) minimax.value = msg.data.minimax;
      if (msg.data.copilot) copilot.value = msg.data.copilot;
      const en = (msg.data as { enabled?: Record<string, boolean> }).enabled;
      if (en) for (const k of Object.keys(en)) enabled[k] = !!en[k];
    } else if (msg.type === 'usageUpdate') {
      if (msg.provider === 'kimi')    kimi.value    = { ...(kimi.value    || {} as UsageProviderState), ...msg };
      if (msg.provider === 'minimax') minimax.value = { ...(minimax.value || {} as UsageProviderState), ...msg };
      if (msg.provider === 'copilot') copilot.value = { ...(copilot.value || {} as UsageProviderState), ...msg };
    } else if (msg.type === 'pendingChanged') {
      for (const k of Object.keys(pendingByCwd)) delete pendingByCwd[k];
      Object.assign(pendingByCwd, msg.byCwd);
    }
  }

  const { isConnected, connect } = useWebSocket(handleMessage);

  onMounted(() => {
    connect();
    nowTimer = setInterval(() => { now.value = Date.now(); }, 1000);
  });
  onBeforeUnmount(() => {
    if (nowTimer) { clearInterval(nowTimer); nowTimer = null; }
  });

  // ===== 派生 5h slot（Kimi / MiniMax 强制 5h，Copilot fallback 周） =====

  function barLevel(percent: number): FiveHourSlot['level'] {
    if (percent > 80) return 'danger';
    if (percent > 50) return 'warn';
    return 'fresh';
  }

  function makeResetTime(raw: string | number | Date | null): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (raw instanceof Date) return raw.getTime();
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0 && n < 31536000000) {
      // 小于 365 天视为相对毫秒数
      return Date.now() + n;
    }
    if (!Number.isNaN(n)) return n;
    const d = new Date(raw as string);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }

  function formatReset(absolute: Date | string | number | null, nowMs: number): string {
    const target = makeResetTime(absolute);
    if (target === null) return '';
    const ms = target - nowMs;
    if (ms <= 0) return '';
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || (days > 0 && mins > 0)) parts.push(`${hours}h`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
    return parts.join(' ');
  }

  const kimiFiveHour = computed<FiveHourSlot>(() => {
    const state = kimi.value;
    const data = state?.data as KimiUsageData | undefined;
    const m = data?.codingFiveHour;
    if (!state || state.error || !m || !m.limit) {
      return { percent: 0, resetTime: null, resetText: '', level: 'muted' };
    }
    const percent = Math.max(0, Math.min(100, m.used ?? 0));
    return {
      percent,
      resetTime: m.resetTime ?? null,
      resetText: formatReset(m.resetTime ?? null, now.value),
      level: barLevel(percent)
    };
  });

  const minimaxFiveHour = computed<FiveHourSlot>(() => {
    const state = minimax.value;
    const data = state?.data as MinimaxUsageData | undefined;
    if (!state || state.error || !data) {
      return { percent: 0, resetTime: null, resetText: '', level: 'muted' };
    }
    // 服务端给的是"剩余 %"，bar 填充 = 100 - remaining
    const percent = Math.max(0, Math.min(100, 100 - (data.fiveHourPercent ?? 0)));
    return {
      percent,
      resetTime: makeResetTime(data.fiveHourResetTime ?? null),
      resetText: formatReset(data.fiveHourResetTime ?? null, now.value),
      level: barLevel(percent)
    };
  });

  const minimaxWeekly = computed<FiveHourSlot>(() => {
    const state = minimax.value;
    const data = state?.data as MinimaxUsageData | undefined;
    if (!state || state.error || !data) {
      return { percent: 0, resetTime: null, resetText: '', level: 'muted' };
    }
    const percent = Math.max(0, Math.min(100, 100 - (data.weeklyPercent ?? 0)));
    return {
      percent,
      resetTime: makeResetTime(data.weeklyResetTime ?? null),
      resetText: formatReset(data.weeklyResetTime ?? null, now.value),
      level: barLevel(percent)
    };
  });

  const copilotSlot = computed<FiveHourSlot>(() => {
    const state = copilot.value;
    const data = state?.data as CopilotUsageData | undefined;
    if (!state || state.error || !data?.premium?.limit) {
      return { percent: 0, resetTime: null, resetText: '', level: 'muted' };
    }
    // Copilot 给的是 remaining/percent，bar 填充直接用 percent（剩的越多 bar 越长）
    const remainingPct = Math.max(0, Math.min(100, data.premium.percent ?? 0));
    // level 按"已用"算 = 100 - remaining
    return {
      percent: remainingPct,
      resetTime: data.premium.resetDate ?? null,
      resetText: data.premium.resetDate ? data.premium.resetDate.slice(5, 10) : '',
      level: barLevel(100 - remainingPct)
    };
  });

  const isProviderEnabled = (id: 'kimi' | 'minimax' | 'copilot') =>
    enabled[id] !== false && kimi.value?.error !== 'disabled' && minimax.value?.error !== 'disabled' && copilot.value?.error !== 'disabled';

  const isProviderConfigured = (id: 'kimi' | 'minimax' | 'copilot') => {
    const err = id === 'kimi' ? kimi.value?.error
              : id === 'minimax' ? minimax.value?.error
              : copilot.value?.error;
    return err !== 'no_token' && err !== 'disabled';
  };

  const pendingCount = computed<number>(() => Object.keys(pendingByCwd).length);

  return {
    isConnected,
    kimiFiveHour,
    minimaxFiveHour,
    minimaxWeekly,
    copilotSlot,
    isProviderEnabled,
    isProviderConfigured,
    pendingCount,
    pendingByCwd
  };
}
