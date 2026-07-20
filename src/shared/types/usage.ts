export type ProviderId = 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex';
export type UsageError = 'no_token' | 'disabled' | string;

export interface UsageMetric {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  resetTime?: string | null;
}

export interface KimiUsageData {
  total: UsageMetric;
  codingWeekly: UsageMetric;
  codingFiveHour: UsageMetric;
}

export interface MinimaxUsageData {
  fiveHourPercent: number;
  weeklyPercent: number;
  // 毫秒级时间戳，距离现在的 reset 时间（服务端给的不是绝对时间，而是距离重置的剩余时间）
  fiveHourResetTime: string | null;
  weeklyResetTime: string | null;
}

export interface CopilotPremiumData {
  limit: number;
  remaining: number;
  percent: number;
  resetDate: string | null;
  resetDateUtc: string | null;
}

export interface CopilotUsageData {
  premium: CopilotPremiumData;
  chat: { percent: number };
  plan: string | null;
  licenseType: string | null;
}

export interface DeepseekUsageData {
  isAvailable: boolean;
  currency: string | null;
  totalBalance: number;
  grantedBalance: number;
  toppedUpBalance: number;
}

export interface CodexWindowData {
  /** 已用 %（服务端 used_percent 原样） */
  usedPercent: number;
  /** 窗口时长（秒），UI 据此判断显示 5h / day / week */
  windowSeconds: number;
  /** 秒级 Unix 时间戳 */
  resetAt: number | null;
}

export interface CodexUsageData {
  planType: string | null;
  primary: CodexWindowData | null;
  secondary: CodexWindowData | null;
  creditsBalance: string | null;
}

export type ProviderUsageData = KimiUsageData | MinimaxUsageData | CopilotUsageData | DeepseekUsageData | CodexUsageData;

export interface UsageProviderState {
  data: ProviderUsageData | null;
  lastUpdated: string | null;
  error: UsageError | null;
}

export type UsageSnapshot = Record<ProviderId, UsageProviderState>;

export interface UsageUpdatePayload {
  provider: ProviderId;
  data: ProviderUsageData | null;
  lastUpdated: string | null;
  error: UsageError | null;
}
