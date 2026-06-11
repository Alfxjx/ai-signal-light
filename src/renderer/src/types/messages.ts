// WebSocket 消息体类型。
// 服务端推送格式见 src/server.js 的 ws.send(...) 调用。

export interface ClaudeProject {
  id: string;
  name: string;
  source?: 'cwd' | 'slug' | 'id';
  cwd?: string | null;
  lastResponse: number | string | null;
}

export interface DetectorDetails {
  projects: ClaudeProject[];
  lastUpdate?: number | string;
}

// 每个 assistant 的形状（detector.getAllStatus 的 value）
export interface AssistantStatus {
  details: DetectorDetails;
  lastUpdate?: number;
  [key: string]: unknown;
}

export interface DetectorAllStatus {
  claude?: AssistantStatus;
  [key: string]: AssistantStatus | undefined;
}

// 用量监控
export type UsageError = 'no_token' | 'disabled' | string;
export type ProviderId = 'kimi' | 'minimax' | 'copilot';

export interface UsageMetric {
  limit?: number;
  used?: number;
  percent?: number;
  resetTime?: number | string;
}

export interface KimiUsageData {
  total?: UsageMetric;
  codingWeekly?: UsageMetric;
  codingFiveHour?: UsageMetric;
  [key: string]: UsageMetric | undefined;
}

export interface MinimaxUsageData {
  fiveHourPercent?: number;
  weeklyPercent?: number;
  fiveHourResetTime?: number | string;
}

// Copilot 标准化形状 —— fetchCopilot 的返回
export interface CopilotPremiumData {
  limit: number;
  remaining: number;
  percent: number;          // 服务端给的剩余 %（如 8.8）
  resetDate: string | null; // "2026-07-01"
  resetDateUtc: string | null;
}

export interface CopilotUsageData {
  premium: CopilotPremiumData;
  chat: { percent: number };
  plan: string | null;
  licenseType: string | null;
}

export interface UsageProviderState {
  lastUpdated?: number;
  error?: UsageError;
  data?: KimiUsageData | MinimaxUsageData | CopilotUsageData | null;
  [key: string]: unknown;
}

export interface UsageEnabledMap {
  kimi?: boolean;
  minimax?: boolean;
  copilot?: boolean;
}

export interface UsageInitPayload {
  kimi: UsageProviderState | null;
  minimax: UsageProviderState | null;
  copilot: UsageProviderState | null;
  enabled?: UsageEnabledMap;
  intervalMinutes?: number;
}

// App 内部聚合的 usage 状态形状
export interface UsageState {
  kimi: UsageProviderState | null;
  minimax: UsageProviderState | null;
  copilot: UsageProviderState | null;
  enabled: UsageEnabledMap;
}

// usageUpdate 推送 spread payload 直接合到 provider 上
export interface UsageUpdatePayload {
  provider: ProviderId;
  [key: string]: unknown;
}

// Claude Code hook 事件（Notification/Stop/PreToolUse）broadcast 时的 WS 形状
export interface ClaudeHookPayload {
  event: 'Notification' | 'Stop' | 'PreToolUse';
  cwd: string | null;
  sessionId: string | null;
  ts: number;
  message?: string;
  toolName?: string;
}

// WS 顶层联合类型
export type WsMessage =
  | { type: 'init'; data: DetectorAllStatus & { usage?: UsageInitPayload } }
  | { type: 'statusChange'; assistantId: string; status?: unknown; data: AssistantStatus }
  | { type: 'usageInit'; data: UsageInitPayload }
  | (UsageUpdatePayload & { type: 'usageUpdate' })
  | (ClaudeHookPayload & { type: 'claudeHook' });
