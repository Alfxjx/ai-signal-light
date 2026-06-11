const { contextBridge, ipcRenderer } = require('electron');

// 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 切换置顶
  toggleAlwaysOnTop: (enabled) => ipcRenderer.invoke('toggle-always-on-top', enabled),

  // 平台信息
  platform: process.platform,

  // 设置（用量监控）
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  openSettings: () => ipcRenderer.invoke('settings:open'),

  // 窗口控制
  resizeWindow: (opts) => ipcRenderer.invoke('window:resize', opts),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  setCompact: (isCompact) => ipcRenderer.invoke('window:set-compact', isCompact),

  // Claude Code hooks
  getHooksSnippet: (enabledOverride) => ipcRenderer.invoke('hooks:get-snippet', enabledOverride),
  installHooks: () => ipcRenderer.invoke('hooks:install'),
  uninstallHooks: () => ipcRenderer.invoke('hooks:uninstall')
});
