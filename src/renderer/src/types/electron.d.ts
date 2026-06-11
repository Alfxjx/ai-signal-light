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
}

export interface SettingsSavePayload {
  kimi: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  minimax: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  copilot: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  proxy: { url: string; urlChanged: boolean };
  intervalMinutes: number;
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
  resizeWindow: (opts: { height: number }) => Promise<void>;
  getWindowState: () => Promise<WindowState | null>;
  setCompact: (isCompact: boolean) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
