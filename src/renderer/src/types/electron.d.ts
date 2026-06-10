// 来自 src/preload.js 暴露的 contextBridge API
// 在所有渲染进程里可用：window.electronAPI?.xxx

export interface SettingsPayload {
  kimi: { token: string; enabled: boolean };
  minimax: { token: string; enabled: boolean };
  intervalMinutes: number;
  hasKimiToken: boolean;
  hasMiniMaxToken: boolean;
}

export interface SettingsSavePayload {
  kimi: { token: string; tokenChanged: boolean; enabled: boolean };
  minimax: { token: string; tokenChanged: boolean; enabled: boolean };
  intervalMinutes: number;
}

export interface ElectronAPI {
  getStatus: () => Promise<unknown>;
  toggleAlwaysOnTop: (enabled: boolean) => Promise<void>;
  platform: string;
  getSettings: () => Promise<SettingsPayload | null>;
  saveSettings: (partial: SettingsSavePayload) => Promise<{ success: boolean }>;
  closeSettings: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
