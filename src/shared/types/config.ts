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

export interface AppConfig {
  kimi: ProviderConfig;
  minimax: ProviderConfig;
  copilot: ProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  window: WindowConfig;
  hooks: HooksConfig;
}

export type ConfigPartial = Partial<Omit<AppConfig, 'hooks' | 'kimi' | 'minimax' | 'copilot' | 'window' | 'proxy'>> & {
  kimi?: Partial<ProviderConfig>;
  minimax?: Partial<ProviderConfig>;
  copilot?: Partial<ProviderConfig>;
  proxy?: Partial<{ url: string }>;
  window?: Partial<WindowConfig>;
  hooks?: Partial<{
    enabled?: Partial<HooksEnabledConfig>;
    endpoint?: Partial<HooksEndpointConfig>;
  }>;
};
