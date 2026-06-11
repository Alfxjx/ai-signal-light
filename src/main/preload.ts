import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/types/ipc';

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 切换置顶
  toggleAlwaysOnTop: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_ALWAYS_ON_TOP, enabled),

  // 平台信息
  platform: process.platform,

  // 设置（用量监控）
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  saveSettings: (partial: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, partial),
  closeSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLOSE),
  openSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_OPEN),

  // 窗口控制
  resizeWindow: (opts: { height: number }) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_RESIZE, opts),
  getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
  setCompact: (isCompact: boolean) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_COMPACT, isCompact),

  // Claude Code hooks
  getHooksSnippet: (enabledOverride?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.HOOKS_GET_SNIPPET, enabledOverride),
  installHooks: () => ipcRenderer.invoke(IPC_CHANNELS.HOOKS_INSTALL),
  uninstallHooks: () => ipcRenderer.invoke(IPC_CHANNELS.HOOKS_UNINSTALL)
});
