// 来自 src/preload.js 暴露的 contextBridge API
// 在所有渲染进程里可用：window.electronAPI?.xxx

export interface SettingsPayload {
  kimi: { token: string; enabled: boolean; useProxy: boolean };
  minimax: { token: string; enabled: boolean; useProxy: boolean };
  copilot: { token: string; enabled: boolean; useProxy: boolean };
  proxy: { url: string };
  intervalMinutes: number;
  hasKimiToken: boolean;
  hasMiniMaxToken: boolean;
  hasCopilotToken: boolean;
  hasProxy: boolean;
  hooks?: {
    enabled: { Notification: boolean; Stop: boolean; PreToolUse: boolean };
    endpoint: { autoInstalled: boolean };
  };
}

export interface SettingsSavePayload {
  kimi: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  minimax: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  copilot: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  proxy: { url: string; urlChanged: boolean };
  intervalMinutes: number;
  hooks?: { enabled: { Notification: boolean; Stop: boolean; PreToolUse: boolean } };
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

export interface ElectronAPI {
  getStatus: () => Promise<unknown>;
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
