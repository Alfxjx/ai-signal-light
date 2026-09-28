export interface ProviderConfig {
  token: string;
  enabled: boolean;
  useProxy: boolean;
}

export interface VolcengineProviderConfig {
  /** AK/SK 通道（官方 OpenAPI，配一次长期有效）。二者齐备时优先于 cookie */
  accessKey: string;
  secretKey: string;
  /** Cookie 通道（控制台会话，约一周需重配），仅在 AK/SK 不可用时回退 */
  cookie: string;
  csrfToken: string;
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

/** 桌面宠物（与悬浮球独立开关，可共存） */
export interface PetConfig {
  enabled: boolean;
  /** 当前活动宠物 id，null 表示未安装/未选中 */
  activePetId: string | null;
  /** 显示缩放 %（50–150，默认 100），窗口尺寸随之变化 */
  scale: number;
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
  /** token 字段存 platform.xiaomimimo.com 复制的整段 Cookie（api-platform_serviceToken / userId 等） */
  mimo: ProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  window: WindowConfig;
  hooks: HooksConfig;
  floatingBall: FloatingBallConfig;
  pet: PetConfig;
  thresholds: UsageThresholds;
  lanMode: LanModeConfig;
}

/**
 * 移动端订阅的精简配置：去除 window/hooks/floatingBall/lanMode 等桌面专属字段，
 * 作为 QR 配对后通过 WebSocket 反向拉取的契约。
 */
export interface MobileAppConfig {
  kimi: ProviderConfig;
  minimax: ProviderConfig;
  copilot: ProviderConfig;
  /** 移动端只用 cookie 通道自取额度，不需要 AK/SK（长期有效的控制面密钥不应下发到手机） */
  volcengine: Omit<VolcengineProviderConfig, 'accessKey' | 'secretKey'>;
  deepseek: ProviderConfig;
  mimo: ProviderConfig;
  proxy: { url: string };
  intervalMinutes: number;
  thresholds: UsageThresholds;
}

export type ConfigPartial = Partial<Omit<AppConfig, 'hooks' | 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex' | 'volcengine' | 'mimo' | 'window' | 'proxy' | 'floatingBall' | 'pet' | 'thresholds' | 'lanMode'>> & {
  kimi?: Partial<ProviderConfig>;
  minimax?: Partial<ProviderConfig>;
  copilot?: Partial<ProviderConfig>;
  deepseek?: Partial<ProviderConfig>;
  codex?: Partial<ProviderConfig>;
  volcengine?: Partial<VolcengineProviderConfig>;
  mimo?: Partial<ProviderConfig>;
  proxy?: Partial<{ url: string }>;
  window?: Partial<WindowConfig>;
  hooks?: Partial<{
    enabled?: Partial<HooksEnabledConfig>;
    endpoint?: Partial<HooksEndpointConfig>;
  }>;
  floatingBall?: Partial<FloatingBallConfig>;
  pet?: Partial<PetConfig>;
  thresholds?: Partial<UsageThresholds>;
  lanMode?: Partial<LanModeConfig>;
};
