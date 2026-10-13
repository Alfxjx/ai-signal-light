import { contextBridge, ipcRenderer } from 'electron';

// ⚠️ preload 运行在 Electron 沙箱里（sandbox 默认开启），沙箱版 preload 的
// require 是简化实现，无法解析 '../shared/...' 这类相对 require（实测报
// "module not found"，导致 electronAPI 整个注入失败、所有 IPC 按钮失灵）。
// 因此本文件必须保持自包含，只允许 require('electron')。
// 下面这份通道表是 src/shared/types/ipc.ts 中 IPC_CHANNELS 的拷贝，
// 新增/修改通道时两处必须同步。
const IPC_CHANNELS = {
  TOGGLE_ALWAYS_ON_TOP: 'toggle-always-on-top',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_OPEN: 'settings:open',
  WINDOW_RESIZE: 'window:resize',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_GET_STATE: 'window:get-state',
  WINDOW_SET_COMPACT: 'window:set-compact',
  HOOKS_GET_SNIPPET: 'hooks:get-snippet',
  HOOKS_INSTALL: 'hooks:install',
  HOOKS_UNINSTALL: 'hooks:uninstall',
  QR_OPEN: 'qr:open',
  COPILOT_DEVICE_START: 'copilot:device-start',
  COPILOT_DEVICE_CANCEL: 'copilot:device-cancel',
  COPILOT_DEVICE_RESULT: 'copilot:device-result',
  FLOATING_BALL_TOGGLE: 'floating-ball:toggle',
  FLOATING_BALL_OPEN_MAIN: 'floating-ball:open-main',
  FLOATING_BALL_GET_STATE: 'floating-ball:get-state',
  FLOATING_BALL_NOTIFY_CLEARED: 'floating-ball:notify-cleared',
  FLOATING_BALL_TOGGLE_DROPDOWN: 'floating-ball:toggle-dropdown',
  FLOATING_BALL_MOVE: 'floating-ball:move',
  FLOATING_BALL_SET_WIDTH: 'floating-ball:set-width',
  PET_GET: 'pet:get',
  PET_LIST: 'pet:list',
  PET_INSTALL: 'pet:install',
  PET_SET_ACTIVE: 'pet:set-active',
  PET_REMOVE: 'pet:remove',
  PET_TOGGLE: 'pet:toggle',
  PET_OPEN_WEB: 'pet:open-web',
  PET_TOGGLE_DROPDOWN: 'pet:toggle-dropdown',
  PET_MOVE: 'pet:move',
  PET_SHOW_MENU: 'pet:show-menu',
  PET_SET_SCALE: 'pet:set-scale',
  PET_CHANGED: 'pet:changed',
  WINDOW_DOCK_STATE: 'window:dock-state',
  WINDOW_DOCK_ANIM: 'window:dock-anim',
  TRAY_HOVER_POINTER: 'tray-hover:pointer',
  TRAY_HOVER_RESIZE: 'tray-hover:resize',
  THEME_CHANGED: 'theme:changed',
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
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  getWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),
  setCompact: (isCompact: boolean) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_COMPACT, isCompact),
  // 顶部吸附状态：'free' | 'collapsed' | 'expanded'，渲染层据此画顶部把手
  onDockStateChange: (cb: (state: string) => void) =>
    ipcRenderer.on(IPC_CHANNELS.WINDOW_DOCK_STATE, (_e, state) => cb(state)),
  // 顶部吸附动画：收到补偿值后做 CSS transform 滑动
  onDockAnim: (cb: (payload: { compensationY: number }) => void) =>
    ipcRenderer.on(IPC_CHANNELS.WINDOW_DOCK_ANIM, (_e, payload) => cb(payload)),

  // 主题：主进程广播主题变化（明/暗/跟随系统），渲染层据此切 <html> 的 dark class
  onThemeChanged: (cb: (theme: string) => void) =>
    ipcRenderer.on(IPC_CHANNELS.THEME_CHANGED, (_e, theme) => cb(theme)),

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

  // 悬浮球
  floatingBall: {
    toggle: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_TOGGLE),
    openMain: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_OPEN_MAIN),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_GET_STATE),
    notifyCleared: (cwd: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_NOTIFY_CLEARED, cwd),
    toggleDropdown: () => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_TOGGLE_DROPDOWN),
    moveBy: (dx: number, dy: number) => ipcRenderer.send(IPC_CHANNELS.FLOATING_BALL_MOVE, dx, dy),
    setWidth: (width: number) => ipcRenderer.invoke(IPC_CHANNELS.FLOATING_BALL_SET_WIDTH, width)
  },

  // 桌面宠物
  pet: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.PET_GET),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PET_LIST),
    install: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PET_INSTALL, input),
    setActive: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PET_SET_ACTIVE, id),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PET_REMOVE, id),
    toggle: () => ipcRenderer.invoke(IPC_CHANNELS.PET_TOGGLE),
    openWeb: () => ipcRenderer.invoke(IPC_CHANNELS.PET_OPEN_WEB),
    toggleDropdown: () => ipcRenderer.invoke(IPC_CHANNELS.PET_TOGGLE_DROPDOWN),
    moveBy: (dx: number, dy: number) => ipcRenderer.send(IPC_CHANNELS.PET_MOVE, dx, dy),
    showMenu: () => ipcRenderer.invoke(IPC_CHANNELS.PET_SHOW_MENU),
    setScale: (scale: number) => ipcRenderer.invoke(IPC_CHANNELS.PET_SET_SCALE, scale),
    onChanged: (cb: () => void) =>
      ipcRenderer.on(IPC_CHANNELS.PET_CHANGED, () => cb())
  },

  // 托盘 hover 弹窗：渲染层回报指针是否在窗口内
  trayHover: {
    pointer: (inside: boolean) => ipcRenderer.send(IPC_CHANNELS.TRAY_HOVER_POINTER, inside),
    resize: (height: number) => ipcRenderer.send(IPC_CHANNELS.TRAY_HOVER_RESIZE, height)
  }
});
