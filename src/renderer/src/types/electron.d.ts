// 来自 src/main/preload.ts 暴露的 contextBridge API
// 在所有渲染进程里可用：window.electronAPI?.xxx
// 从 src/shared/types/ipc 统一导出，保持渲染层 import 路径兼容。

export type {
  SettingsPayload,
  SettingsSavePayload,
  HooksSnippetInfo,
  HooksInstallResult,
  HooksUninstallResult,
  WindowState,
  FloatingBallState,
  ElectronAPI,
} from '../../../shared/types/ipc';

import type { ElectronAPI } from '../../../shared/types/ipc';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
