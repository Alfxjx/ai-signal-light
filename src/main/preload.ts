import { contextBridge, ipcRenderer } from 'electron';

/** IPC 通道名称常量（与主进程保持一致） */
const IPC_CHANNELS = {
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
} as const;

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
  uninstallHooks: () => ipcRenderer.invoke(IPC_CHANNELS.HOOKS_UNINSTALL),

  // 手机配对二维码
  openQrWindow: () => ipcRenderer.invoke(IPC_CHANNELS.QR_OPEN),

  // Copilot Device Flow 授权
  copilotStartDeviceFlow: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_DEVICE_START),
  copilotCancelDeviceFlow: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT_DEVICE_CANCEL),
  onCopilotDeviceResult: (cb: (r: { success: boolean; error?: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.COPILOT_DEVICE_RESULT, (_e, r) => cb(r)),

  // Kimi 内嵌登录窗口抓 token
  kimiStartLogin: () => ipcRenderer.invoke(IPC_CHANNELS.KIMI_LOGIN_START),
  onKimiLoginResult: (cb: (r: { success: boolean; tokenExp?: number | null; error?: string }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.KIMI_LOGIN_RESULT, (_e, r) => cb(r)),

  // 悬浮球
  floatingBall: {
    toggle: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_TOGGLE),
    openMain: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_OPEN_MAIN),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_GET_STATE),
    notifyCleared: (cwd: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_NOTIFY_CLEARED, cwd)
  }
});
