import type { AppConfig, UsageThresholds } from './config';

export interface SettingsPayload extends AppConfig {
  hasKimiToken: boolean;
  hasMiniMaxToken: boolean;
  hasCopilotToken: boolean;
  hasProxy: boolean;
  copilotOAuth: boolean;
  hasDeepseekToken: boolean;
  codexAutoAvailable: boolean;
  hasVolcengineCookie: boolean;
  hasVolcengineCsrfToken: boolean;
  hasVolcengineAccessKey: boolean;
  hasVolcengineSecretKey: boolean;
  hasMimoCookie: boolean;
}

export interface SettingsSavePayload {
  kimi: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  minimax: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  copilot: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  deepseek: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  /** token 字段存 platform.xiaomimimo.com 复制的整段 Cookie */
  mimo: { token: string; tokenChanged: boolean; enabled: boolean; useProxy: boolean };
  codex?: { enabled: boolean; useProxy: boolean };
  volcengine?: {
    accessKey: string; accessKeyChanged: boolean;
    secretKey: string; secretKeyChanged: boolean;
    cookie: string; cookieChanged: boolean;
    csrfToken: string; csrfTokenChanged: boolean;
    enabled: boolean; useProxy: boolean;
  };
  proxy: { url: string; urlChanged: boolean };
  intervalMinutes: number;
  hooks?: { enabled: { Notification: boolean; Stop: boolean; PreToolUse: boolean } };
  floatingBall?: { enabled: boolean };
  pet?: { enabled: boolean };
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

/** 主面板顶部吸附状态 */
export type DockStateName = 'free' | 'collapsed' | 'expanded';

export interface FloatingBallState {
  visible: boolean;
  enabled: boolean;
}

/** 桌面宠物：素材库元信息（不含图集本体） */
export interface PetMeta {
  id: string;
  name: string;
  author: string;
  source: string;
  addedAt: number;
}

/** 完整宠物记录（含 base64 图集 dataUrl，主进程读回时返回） */
export interface PetRecord extends PetMeta {
  dataUrl: string;
}

/** 安装一只宠物：渲染层下载并校验后交给主进程持久化 */
export interface PetInstallInput {
  name: string;
  author: string;
  source: string;
  dataUrl: string;
}

/** 宠物窗口初始化数据：活动宠物 + 显示缩放 */
export interface PetGetResult {
  pet: PetRecord | null;
  scale: number;
}

export interface PetOpenWebResult {
  ok: boolean;
  url?: string;
  error?: string;
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
  onDockStateChange: (cb: (state: DockStateName) => void) => void;
  /** 顶部吸附动画：窗口已被主进程瞬移，渲染层把内容 translateY(补偿值)→0 做 GPU 滑动 */
  onDockAnim: (cb: (payload: { compensationY: number }) => void) => void;
  getHooksSnippet: (enabledOverride?: Partial<{ Notification: boolean; Stop: boolean; PreToolUse: boolean }>) => Promise<HooksSnippetInfo | null>;
  installHooks: () => Promise<HooksInstallResult>;
  uninstallHooks: () => Promise<HooksUninstallResult>;
  openQrWindow: () => Promise<void>;
  copilotStartDeviceFlow: () => Promise<CopilotDeviceStartResult>;
  copilotCancelDeviceFlow: () => Promise<void>;
  onCopilotDeviceResult: (cb: (r: CopilotDeviceResult) => void) => void;
  floatingBall: {
    toggle: () => Promise<void>;
    openMain: () => Promise<void>;
    getState: () => Promise<FloatingBallState>;
    notifyCleared: (cwd: string) => Promise<void>;
    /** 悬浮球短按：切换下方的下拉窗口可见性 */
    toggleDropdown: () => Promise<void>;
    /** 浮球自绘拖动：回报位移增量（dx/dy 像素） */
    moveBy: (dx: number, dy: number) => void;
    /** 气泡展开/收起：动态调整悬浮球窗口宽度（保持左上角锚点，向右扩展） */
    setWidth: (width: number) => Promise<void>;
  };
  pet: {
    /** 当前活动宠物（含图集 dataUrl）与显示缩放；无活动宠物返回 { pet: null, scale } */
    get: () => Promise<PetGetResult>;
    list: () => Promise<PetMeta[]>;
    /** 保存一只已下载并校验的宠物并设为活动 */
    install: (input: PetInstallInput) => Promise<PetMeta>;
    setActive: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    toggle: () => Promise<void>;
    /** 单击宠物：打开本地 Kimi Code Web（已打开时浏览器聚焦已有标签） */
    openWeb: () => Promise<PetOpenWebResult>;
    /** 左键长按：切换下方下拉窗口（锚定宠物窗口） */
    toggleDropdown: () => Promise<void>;
    /** 宠物自绘拖动：回报位移增量 */
    moveBy: (dx: number, dy: number) => void;
    /** 右键：弹出原生菜单（打开 Kimi Web / 打开设置 / 隐藏宠物） */
    showMenu: () => Promise<void>;
    /** 调整显示缩放 %（50–150），主进程会重设窗口尺寸 */
    setScale: (scale: number) => Promise<void>;
    /** 活动宠物/缩放变化时主进程推送，宠物窗口据此重建播放器 */
    onChanged: (cb: () => void) => void;
  };
  trayHover: {
    // 弹窗渲染层回报指针当前位置：用于决定是否取消关闭 timer
    // （leave tray 后，如果光标进了弹窗，就不关）
    pointer: (inside: boolean) => void;
    /** 渲染层回报内容高度，主进程据此调整弹窗窗口高度 */
    resize: (height: number) => void;
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
} as const;
