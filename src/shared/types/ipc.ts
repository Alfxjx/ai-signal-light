import type { AppConfig, UsageThresholds } from './config';

export interface SettingsPayload extends AppConfig {
  hasKimiToken: boolean;
  hasMiniMaxToken: boolean;
  hasCopilotToken: boolean;
  hasProxy: boolean;
  kimiTokenExp: number | null;
  copilotOAuth: boolean;
  hasDeepseekToken: boolean;
  codexAutoAvailable: boolean;
}

export interface SettingsSavePayload {
  kimi: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  minimax: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  copilot: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  deepseek: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  codex?: { enabled: boolean; useProxy: boolean };
  proxy: { url: string; urlChanged: boolean };
  intervalMinutes: number;
  hooks?: { enabled: { Notification: boolean; Stop: boolean; PreToolUse: boolean } };
  floatingBall?: { enabled: boolean };
  thresholds?: UsageThresholds;
  lanMode?: { enabled: boolean; apiKey?: string };
}

export interface HooksSnippetInfo {
  snippet: string;
  autoInstalled: boolean;
  helperPath: string;
}

export interface HooksInstallResult {
  success: boolean;
  installed?: string[];
  skipped?: string[];
  error?: string;
}

export interface HooksUninstallResult {
  success: boolean;
  removed?: number;
  error?: string;
}

export interface WindowState {
  width: number;
  height: number;
  isCompact: boolean;
}

export interface FloatingBallState {
  visible: boolean;
  enabled: boolean;
}

export interface CopilotDeviceStartResult {
  success: boolean;
  userCode?: string;
  verificationUri?: string;
  error?: string;
}

export interface CopilotDeviceResult {
  success: boolean;
  error?: string;
}

export interface KimiLoginResult {
  success: boolean;
  /** 抓到的 token 过期时间（秒级 Unix 时间戳） */
  tokenExp?: number | null;
  error?: string;
}

/** 渲染进程侧 API 接口 */
export interface ElectronAPI {
  toggleAlwaysOnTop: (enabled: boolean) => Promise<void>;
  platform: string;
  getSettings: () => Promise<SettingsPayload | null>;
  saveSettings: (partial: SettingsSavePayload) => Promise<{ success: boolean }>;
  closeSettings: () => Promise<void>;
  openSettings: () => Promise<void>;
  resizeWindow: (opts: { height: number }) => Promise<void>;
  getWindowState: () => Promise<WindowState | null>;
  setCompact: (isCompact: boolean) => Promise<void>;
  getHooksSnippet: (enabledOverride?: Partial<{ Notification: boolean; Stop: boolean; PreToolUse: boolean }>) => Promise<HooksSnippetInfo | null>;
  installHooks: () => Promise<HooksInstallResult>;
  uninstallHooks: () => Promise<HooksUninstallResult>;
  openQrWindow: () => Promise<void>;
  copilotStartDeviceFlow: () => Promise<CopilotDeviceStartResult>;
  copilotCancelDeviceFlow: () => Promise<void>;
  onCopilotDeviceResult: (cb: (r: CopilotDeviceResult) => void) => void;
  kimiStartLogin: () => Promise<{ success: boolean; error?: string }>;
  onKimiLoginResult: (cb: (r: KimiLoginResult) => void) => void;
  floatingBall: {
    toggle: () => Promise<void>;
    openMain: () => Promise<void>;
    getState: () => Promise<FloatingBallState>;
    notifyCleared: (cwd: string) => Promise<void>;
  };
  trayHover: {
    // 弹窗渲染层回报指针当前位置：用于决定是否取消关闭 timer
    // （leave tray 后，如果光标进了弹窗，就不关）
    pointer: (inside: boolean) => void;
  };
}

/** IPC 通道名称常量（主进程和 preload 共用） */
export const IPC_CHANNELS = {
  TOGGLE_ALWAYS_ON_TOP: 'toggle-always-on-top',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_OPEN: 'settings:open',
  WINDOW_RESIZE: 'window:resize',
  WINDOW_GET_STATE: 'window:get-state',
  WINDOW_SET_COMPACT: 'window:set-compact',
  HOOKS_GET_SNIPPET: 'hooks:get-snippet',
  HOOKS_INSTALL: 'hooks:install',
  HOOKS_UNINSTALL: 'hooks:uninstall',
  QR_OPEN: 'qr:open',
  COPILOT_DEVICE_START: 'copilot:device-start',
  COPILOT_DEVICE_CANCEL: 'copilot:device-cancel',
  COPILOT_DEVICE_RESULT: 'copilot:device-result',
  KIMI_LOGIN_START: 'kimi:login-start',
  KIMI_LOGIN_RESULT: 'kimi:login-result',
  FLOATING_BALL_TOGGLE: 'floating-ball:toggle',
  FLOATING_BALL_OPEN_MAIN: 'floating-ball:open-main',
  FLOATING_BALL_GET_STATE: 'floating-ball:get-state',
  FLOATING_BALL_NOTIFY_CLEARED: 'floating-ball:notify-cleared',
  TRAY_HOVER_POINTER: 'tray-hover:pointer',
} as const;
