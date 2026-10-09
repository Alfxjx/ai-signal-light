export interface ProviderConfig {
  token: string;
  enabled: boolean;
  useProxy: boolean;
}

export interface VolcengineProviderConfig {
  /** 火山引擎官方 OpenAPI 的访问密钥 ID（AKLT...，来自 console.volcengine.com/iam/keymanage/） */
  accessKey: string;
  /** 火山引擎官方 OpenAPI 的访问密钥 Secret（长期有效，无需像 Cookie 那样定期更换） */
  secretKey: string;
  enabled: boolean;
  useProxy: boolean;
}

export interface WindowConfig {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  isCompact: boolean;
  /** 是否吸附在屏幕顶部（收起态）；x/y 始终存展开态的位置 */
  dockedTop: boolean;
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

export interface LanModeConfig {
  enabled: boolean;
  apiKey: string;
}

export interface AppConfig {
  kimi: ProviderConfig;
  minimax: ProviderConfig;
  copilot: ProviderConfig;
  deepseek: ProviderConfig;
  codex: ProviderConfig;
  volcengine: VolcengineProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  window: WindowConfig;
  hooks: HooksConfig;
  floatingBall: FloatingBallConfig;
  thresholds: UsageThresholds;
  lanMode: LanModeConfig;
}

/**
 * 移动端订阅的精简配置：去除 window/hooks/floatingBall/lanMode 等桌面专属字段，
 * 同时不下发火山 AK/SK（属于长期有效的控制面密钥，安卓端手动填写），
 * 作为 QR 配对后通过 WebSocket 反向拉取的契约。
 */
export interface MobileAppConfig {
  kimi: ProviderConfig;
  minimax: ProviderConfig;
  copilot: ProviderConfig;
  deepseek: ProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  thresholds: UsageThresholds;
}

export type ConfigPartial = Partial<Omit<AppConfig, 'hooks' | 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex' | 'volcengine' | 'window' | 'proxy' | 'floatingBall' | 'thresholds' | 'lanMode'>> & {
  kimi?: Partial<ProviderConfig>;
  minimax?: Partial<ProviderConfig>;
  copilot?: Partial<ProviderConfig>;
  deepseek?: Partial<ProviderConfig>;
  codex?: Partial<ProviderConfig>;
  volcengine?: Partial<VolcengineProviderConfig>;
  proxy?: Partial<{ url: string }>;
  window?: Partial<WindowConfig>;
  hooks?: Partial<{
    enabled?: Partial<HooksEnabledConfig>;
    endpoint?: Partial<HooksEndpointConfig>;
  }>;
  floatingBall?: Partial<FloatingBallConfig>;
  thresholds?: Partial<UsageThresholds>;
  lanMode?: Partial<LanModeConfig>;
};
