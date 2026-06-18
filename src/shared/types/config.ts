export interface ProviderConfig {
  token: string;
  enabled: boolean;
  useProxy: boolean;
}

export interface WindowConfig {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  isCompact: boolean;
}

export interface HooksEnabledConfig {
  Notification: boolean;
  Stop: boolean;
  PreToolUse: boolean;
}

export interface HooksEndpointConfig {
  autoInstalled: boolean;
}

export interface HooksConfig {
  enabled: HooksEnabledConfig;
  endpoint: HooksEndpointConfig;
}

export interface FloatingBallConfig {
  enabled: boolean;
  x: number | null;
  y: number | null;
  isVisible: boolean;
}

export interface UsageThresholds {
  /** 超过该已用 % 进入 warn (黄) */
  warn: number;
  /** 超过该已用 % 进入 danger (红)，必须大于 warn */
  danger: number;
}

export const DEFAULT_USAGE_THRESHOLDS: UsageThresholds = { warn: 50, danger: 80 };

export interface AppConfig {
  kimi: ProviderConfig;
  minimax: ProviderConfig;
  copilot: ProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  window: WindowConfig;
  hooks: HooksConfig;
  floatingBall: FloatingBallConfig;
  thresholds: UsageThresholds;
}

export type ConfigPartial = Partial<Omit<AppConfig, 'hooks' | 'kimi' | 'minimax' | 'copilot' | 'window' | 'proxy' | 'floatingBall' | 'thresholds'>> & {
  kimi?: Partial<ProviderConfig>;
  minimax?: Partial<ProviderConfig>;
  copilot?: Partial<ProviderConfig>;
  proxy?: Partial<{ url: string }>;
  window?: Partial<WindowConfig>;
  hooks?: Partial<{
    enabled?: Partial<HooksEnabledConfig>;
    endpoint?: Partial<HooksEndpointConfig>;
  }>;
  floatingBall?: Partial<FloatingBallConfig>;
  thresholds?: Partial<UsageThresholds>;
};
