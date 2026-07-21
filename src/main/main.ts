import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import QRCode from 'qrcode';
import { StatusServer } from './server';
import { ConfigStore, VALID_INTERVALS, HOOK_EVENTS } from './config';
import { UsageMonitor, parseProxyUrl } from './usage-monitor';
import { openKimiLoginWindow, closeKimiLoginWindow, decodeJwtExp } from './kimi-login';
import { startDeviceFlow, pollDeviceFlow, isCopilotOAuthToken } from './copilot-auth';
import { codexAuthAvailable } from './codex-credentials';
import { WS_PORT } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/types/ipc';
import type { HooksInstallResult, HooksUninstallResult } from '../shared/types/ipc';
import { buildQrPayload, encodeQrPayload, generateApiKey, getLanIp } from './pairing';

// 统一 dev 与打包后的 userData 目录名，并刻意区分二者。
// - dev 模式 (electron dist/main/main.js --dev) 用 "AI状态监控-dev" → %APPDATA%/AI状态监控-dev/
// - 打包后 (electron-builder 写 productName="AI状态监控") 用 "AI状态监控" → %APPDATA%/AI状态监控/
// 区分的好处：dev 的设置 / 悬浮球位置 / 调试日志都不会污染线上配置。
// 必须在 app.whenReady 之前调用，且早于 ConfigStore 构造（后者读 app.getPath('userData')）。
const _isDevForName = process.argv.includes('--dev');
app.setName(_isDevForName ? 'AI状态监控-dev' : 'AI状态监控');

// 保持全局引用，防止被垃圾回收
let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let floatingBallWindow: BrowserWindow | null = null;
let qrWindow: BrowserWindow | null = null;
let trayHoverWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: StatusServer | null = null;
let configStore: ConfigStore | null = null;
let usageMonitor: UsageMonitor | null = null;
let copilotDeviceCancelled = false;
let isQuitting = false;

// 托盘 hover 弹窗：进入/离开的 debounce timer 和指针位置标记
// - trayHoverShowTimer: 鼠标进入托盘后延迟 180ms 才弹窗，避免快速划过闪烁
// - trayHoverHideTimer: 鼠标离开托盘/弹窗后延迟 280ms 才关闭，允许移到弹窗上继续看
// - pointerInsideTray / pointerInsideHover: 弹窗渲染层通过 IPC 回报指针位置
// - lastHoverCursor: 鼠标进入托盘瞬间捕获的坐标，定位 popup 时以它为锚点
const TRAY_HOVER_SHOW_DELAY_MS = 180;
const TRAY_HOVER_HIDE_DELAY_MS = 280;
let trayHoverShowTimer: NodeJS.Timeout | null = null;
let trayHoverHideTimer: NodeJS.Timeout | null = null;
let pointerInsideTray = false;
let pointerInsideHover = false;
let lastHoverCursor: { x: number; y: number } | null = null;

// 判断是否为开发模式
const isDev = process.argv.includes('--dev');

// dev 模式下渲染层走 Vite (5173)；生产环境走内嵌 server (WS_PORT)
// 注意：server 现在 bind 127.0.0.1，所以这里也用 127.0.0.1 防止 IPv6 解析跑偏
const RENDERER_BASE = isDev ? 'http://localhost:5173' : `http://127.0.0.1:${WS_PORT}`;

// Claude Code hooks 相关常量
const HOOK_HELPER_DIR = path.join(os.homedir(), '.ai-status-monitor');
const HOOK_HELPER_PATH = path.join(HOOK_HELPER_DIR, 'claude-hook.js');
const HOOK_MARKER = 'claude-hook.js'; // settings.json 里识别我们写入条目的子串
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_SETTINGS_BAK = CLAUDE_SETTINGS + '.bak';

function createWindow(): void {
  const cfgWin = (configStore && configStore.get().window) || { width: 240, height: 550, x: null, y: null, isCompact: true };
  const persistedW = Number.isFinite(cfgWin.width) ? cfgWin.width : 240;
  const persistedH = Number.isFinite(cfgWin.height) ? cfgWin.height : 550;
  // 持久化的 x/y 必须落在当前某个显示器内才有效（防止断开副屏后窗口飞到屏外）
  const hasSavedPos = Number.isFinite(cfgWin.x) && Number.isFinite(cfgWin.y)
    && isRectVisible(cfgWin.x as number, cfgWin.y as number, persistedW, persistedH);

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width: persistedW,
    height: persistedH,
    minWidth: 220,
    minHeight: 352,
    resizable: true,
    maximizable: false,
    minimizable: true,
    alwaysOnTop: true,        // 置顶显示
    skipTaskbar: false,
    frame: false,             // 无边框
    transparent: true,        // 透明背景
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '..', 'renderer', 'technical-support.png'),
    show: false               // 初始隐藏，等加载完成再显示
  };
  if (hasSavedPos) {
    winOpts.x = cfgWin.x as number;
    winOpts.y = cfgWin.y as number;
  }

  mainWindow = new BrowserWindow(winOpts);

  // 加载页面
  mainWindow.loadURL(RENDERER_BASE);
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // 无持久化位置（首次启动或越界 fallback）才自动贴当前光标所在屏右上角
    if (!hasSavedPos) positionWindow();
  });

  // 持久化窗口尺寸/位置（debounce 400ms）
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || !configStore) return;
    const b = mainWindow.getBounds();
    const currentWindow = configStore.get().window;
    configStore.update({ window: { width: b.width, height: b.height, x: b.x, y: b.y, isCompact: currentWindow.isCompact } });
  };
  let boundsTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(saveBounds, 400);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);

  // 关闭按钮只是隐藏窗口
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 将窗口贴到「光标所在显示器」的右上角（fallback：primary）
function positionWindow(): void {
  if (!mainWindow) return;

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const wa = display.workArea; // 含 x/y/width/height，相对于全局坐标系

  const [winWidth] = mainWindow.getSize();
  mainWindow.setPosition(wa.x + wa.width - winWidth - 20, wa.y + 20);
}

// 判断一个矩形是否至少有一部分落在某个显示器的工作区内
function isRectVisible(x: number, y: number, w: number, h: number): boolean {
  if (![x, y, w, h].every(Number.isFinite)) return false;
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const a = d.workArea;
    // 矩形重叠判断
    return x < a.x + a.width && x + w > a.x && y < a.y + a.height && y + h > a.y;
  });
}

// ==================== 托盘 hover 弹窗 ====================

const TH_WIDTH = 200;   // 与 tray-hover.css 的 html/body width 保持一致
const TH_HEIGHT = 260;  // 单列分段：header + 5 个 provider section + padding

// 创建托盘 hover 弹窗（首次 hover 时创建，之后复用）
function createTrayHoverWindow(): BrowserWindow {
  if (trayHoverWindow && !trayHoverWindow.isDestroyed()) {
    return trayHoverWindow;
  }
  trayHoverWindow = new BrowserWindow({
    width: TH_WIDTH,
    height: TH_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    // 永远在托盘图标之上层；同时不抢主屏焦点
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // 失焦时不自动隐藏 — 由 tray 的 mouse-leave/弹窗的 mouse-leave 共同决定
  trayHoverWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  trayHoverWindow.loadURL(`${RENDERER_BASE}/tray-hover.html`);
  if (isDev) {
    // dev 模式下打开独立 devtools 窗口，方便调 tray-hover 弹窗的样式/数据
    trayHoverWindow.webContents.openDevTools({ mode: 'detach' });
    // dev 模式下自动定位+显示弹窗，省得每次调试都得 hover 托盘图标
    // tray 刚构造时 getBounds() 可能返回 0,0,0,0，延迟 200ms / 800ms 再定位一次兜底
    positionTrayHover();
    trayHoverWindow.show();
    trayHoverWindow.webContents.send(IPC_CHANNELS.TRAY_HOVER_SHOWN);
    setTimeout(() => positionTrayHover(), 200);
    setTimeout(() => positionTrayHover(), 800);
  }
  trayHoverWindow.on('closed', () => { trayHoverWindow = null; });
  return trayHoverWindow;
}

// 把弹窗定位到托盘图标正上方：水平居中于图标，底部贴任务栏
// 锚点：优先 tray.getBounds()（hover 时已过构造期，bounds 有效），无效时退化为
//       mouse-enter 瞬间捕获的 cursor（lastHoverCursor）
// 任务栏方位由 display.workArea 相对 display.bounds 缩进的那条边推断：
//   - 底部（默认）：popup 水平居中于图标，bottom = wa.bottom（贴任务栏上沿）
//   - 顶部：popup 水平居中于图标，top = wa.top（贴任务栏下沿）
//   - 左/右：popup 贴任务栏内侧边，竖直居中于图标
function positionTrayHover(): void {
  if (!trayHoverWindow || trayHoverWindow.isDestroyed()) return;

  const icon = tray && !tray.isDestroyed() ? tray.getBounds() : null;
  const iconValid = !!icon && icon.width > 0 && icon.height > 0;
  // 图标中心；icon bounds 无效时退化为 hover 捕获的 cursor / 当前 cursor
  const fallback = lastHoverCursor ?? screen.getCursorScreenPoint();
  const centerX = iconValid ? icon.x + icon.width / 2 : fallback.x;
  const centerY = iconValid ? icon.y + icon.height / 2 : fallback.y;

  const display = screen.getDisplayNearestPoint({ x: centerX, y: centerY }) || screen.getPrimaryDisplay();
  const wa = display.workArea;
  const db = display.bounds;

  // 推断任务栏所在边：workArea 相对 bounds 缩进的那条边即任务栏
  const taskbarTop = wa.y > db.y;
  const taskbarLeft = wa.x > db.x;
  const taskbarRight = wa.x + wa.width < db.x + db.width;

  let x: number;
  let y: number;
  if (taskbarLeft || taskbarRight) {
    // 任务栏在左/右：贴内侧边，竖直居中于图标
    x = taskbarLeft ? wa.x : wa.x + wa.width - TH_WIDTH;
    y = Math.round(centerY - TH_HEIGHT / 2);
    if (y < wa.y) y = wa.y;
    if (y + TH_HEIGHT > wa.y + wa.height) y = wa.y + wa.height - TH_HEIGHT;
  } else if (taskbarTop) {
    // 任务栏在顶部：图标下方，水平居中，顶部贴任务栏
    x = Math.round(centerX - TH_WIDTH / 2);
    y = wa.y;
  } else {
    // 默认任务栏在底部：图标上方，水平居中，底部贴任务栏
    x = Math.round(centerX - TH_WIDTH / 2);
    y = wa.y + wa.height - TH_HEIGHT;
  }
  if (x < wa.x) x = wa.x;
  if (x + TH_WIDTH > wa.x + wa.width) x = wa.x + wa.width - TH_WIDTH;

  console.log('[tray-hover] position:', { icon, centerX, centerY, x, y, wa });
  trayHoverWindow.setBounds({ x, y, width: TH_WIDTH, height: TH_HEIGHT });
}

function clearTrayHoverTimers(): void {
  if (trayHoverShowTimer) { clearTimeout(trayHoverShowTimer); trayHoverShowTimer = null; }
  if (trayHoverHideTimer) { clearTimeout(trayHoverHideTimer); trayHoverHideTimer = null; }
}

function scheduleShowTrayHover(): void {
  if (trayHoverHideTimer) { clearTimeout(trayHoverHideTimer); trayHoverHideTimer = null; }
  if (trayHoverWindow && trayHoverWindow.isVisible()) return; // 已经显示
  if (trayHoverShowTimer) return; // 已经在排队
  trayHoverShowTimer = setTimeout(() => {
    trayHoverShowTimer = null;
    const win = createTrayHoverWindow();
    positionTrayHover();
    if (!win.isVisible()) win.show();
    // 通知弹窗已显示，让它主动请求刷新一次用量数据
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TRAY_HOVER_SHOWN);
    }
  }, TRAY_HOVER_SHOW_DELAY_MS);
}

function scheduleHideTrayHover(): void {
  if (trayHoverShowTimer) { clearTimeout(trayHoverShowTimer); trayHoverShowTimer = null; }
  if (!trayHoverWindow || !trayHoverWindow.isVisible()) return;
  if (trayHoverHideTimer) return;
  trayHoverHideTimer = setTimeout(() => {
    trayHoverHideTimer = null;
    if (trayHoverWindow && !trayHoverWindow.isDestroyed() && trayHoverWindow.isVisible()) {
      trayHoverWindow.hide();
    }
  }, TRAY_HOVER_HIDE_DELAY_MS);
}

// 托盘弹窗渲染层回报：指针是否在窗口内
ipcMain.on(IPC_CHANNELS.TRAY_HOVER_POINTER, (_event, inside: boolean) => {
  pointerInsideHover = !!inside;
  if (inside) {
    // 光标进了弹窗 → 取消隐藏排队
    if (trayHoverHideTimer) { clearTimeout(trayHoverHideTimer); trayHoverHideTimer = null; }
  } else {
    // 光标离开弹窗 → 如果也不在托盘上，就排队隐藏
    if (!pointerInsideTray) scheduleHideTrayHover();
  }
});

// 创建系统托盘
function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'renderer', 'technical-support.png');

  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('AI助手状态监控');

  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleWindow());

  // hover 弹窗：mouse-enter 后延迟弹，mouse-leave 后延迟收
  // 收尾由两个 IPC 状态共同决定（pointerInsideTray / pointerInsideHover）
  tray.on('mouse-enter', () => {
    pointerInsideTray = true;
    // 捕获进入瞬间的 cursor 坐标，定位 popup 时作为锚点（不依赖可能不准的 tray.getBounds）
    lastHoverCursor = screen.getCursorScreenPoint();
    if (trayHoverHideTimer) { clearTimeout(trayHoverHideTimer); trayHoverHideTimer = null; }
    scheduleShowTrayHover();
  });
  tray.on('mouse-leave', () => {
    pointerInsideTray = false;
    // 光标可能移到了弹窗上 → 等 pointer 事件来决定是否真关
    if (!pointerInsideHover) scheduleHideTrayHover();
  });
}

// 构造托盘菜单（每次 config 变化时调用以刷新勾选状态）
function buildTrayMenu(): Electron.Menu {
  const cfg = configStore!.get();

  const intervalSubmenu = VALID_INTERVALS.map(m => ({
    label: `${m} 分钟`,
    type: 'radio' as const,
    checked: cfg.intervalMinutes === m,
    click: () => {
      configStore!.update({ intervalMinutes: m });
      rebuildTray();
    }
  }));

  return Menu.buildFromTemplate([
    { label: '显示/隐藏面板', click: () => toggleWindow() },
    { label: '显示/隐藏悬浮球', click: () => toggleFloatingBall() },
    { type: 'separator' },
    {
      label: '启用 Kimi',
      type: 'checkbox',
      checked: cfg.kimi.enabled,
      click: (item: Electron.MenuItem) => {
        configStore!.update({ kimi: { enabled: item.checked } });
        rebuildTray();
      }
    },
    {
      label: '启用 MiniMax',
      type: 'checkbox',
      checked: cfg.minimax.enabled,
      click: (item: Electron.MenuItem) => {
        configStore!.update({ minimax: { enabled: item.checked } });
        rebuildTray();
      }
    },
    {
      label: '启用 Copilot',
      type: 'checkbox',
      checked: cfg.copilot.enabled,
      click: (item: Electron.MenuItem) => {
        configStore!.update({ copilot: { enabled: item.checked } });
        rebuildTray();
      }
    },
    { type: 'separator' },
    {
      label: 'LAN 模式（手机同步）',
      type: 'checkbox',
      checked: cfg.lanMode?.enabled || false,
      click: (item: Electron.MenuItem) => toggleLanMode(item.checked)
    },
    {
      label: '显示手机配对二维码',
      enabled: true,
      click: () => openQrWindow()
    },
    { type: 'separator' },
    { label: '设置 Token…', click: () => openSettingsWindow() },
    { label: `刷新周期 (${cfg.intervalMinutes} 分钟)`, submenu: intervalSubmenu },
    { label: '立即刷新', click: () => usageMonitor && usageMonitor.checkAll() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function rebuildTray(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

/** 切换 LAN 模式；首次开启时若不存在 apiKey 则自动生成 */
function toggleLanMode(enabled: boolean): void {
  if (!configStore) return;
  const cfg = configStore.get();
  let apiKey = cfg.lanMode?.apiKey || '';
  if (enabled && !apiKey) {
    apiKey = generateApiKey();
  }
  configStore.update({ lanMode: { enabled, apiKey } });
  if (server) server.restart();
  rebuildTray();
}

/** 打开二维码窗口，展示手机配对二维码 */
async function openQrWindow(): Promise<void> {
  if (!configStore) return;
  const cfg = configStore.get();
  if (!cfg.lanMode?.enabled) {
    // 未开启 LAN 模式时自动开启并生成 key
    toggleLanMode(true);
  }
  const freshCfg = configStore.get();
  const apiKey = freshCfg.lanMode?.apiKey || generateApiKey();
  if (!freshCfg.lanMode?.apiKey) {
    configStore.update({ lanMode: { enabled: true, apiKey } });
  }

  const payload = buildQrPayload(freshCfg, apiKey);
  const payloadString = encodeQrPayload(payload);
  const dataUrl = await QRCode.toDataURL(payloadString, { width: 280, margin: 2 });

  if (qrWindow && !qrWindow.isDestroyed()) {
    qrWindow.focus();
    return;
  }

  qrWindow = new BrowserWindow({
    width: 360,
    height: 420,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    title: '手机配对二维码',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const host = payload.host;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; text-align: center; }
        h2 { margin: 0 0 8px; font-size: 18px; }
        .hint { color: #666; font-size: 13px; margin-bottom: 16px; }
        .warning { color: #d32f2f; font-size: 12px; margin-top: 12px; }
        img { width: 280px; height: 280px; border: 1px solid #eee; border-radius: 8px; }
        .addr { color: #888; font-size: 12px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <h2>AI 状态监控 · 手机配对</h2>
      <div class="hint">使用手机 App 扫描下方二维码导入配置</div>
      <img src="${dataUrl}" alt="配对二维码">
      <div class="addr">服务器地址：${host}:${WS_PORT}</div>
      <div class="warning">⚠ 二维码包含明文 Token，请勿截图分享或让他人拍照</div>
    </body>
    </html>
  `;

  qrWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  qrWindow.on('closed', () => { qrWindow = null; });
}

// 打开设置窗口（已存在则聚焦）
function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 600,
    modal: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  settingsWindow.loadURL(`${RENDERER_BASE}/settings.html`);
  settingsWindow.once('ready-to-show', () => {
    settingsWindow?.center();
    settingsWindow?.show();
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// 切换窗口显示/隐藏，必要时重建
function toggleWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
}

// ==================== Floating Bar（输入法浮窗风格小方块） ====================

const FB_WIDTH = 140;
const FB_HEIGHT = 104;

// 创建悬浮球窗口（不可拖动标题栏/工具栏样式，整球可拖）
function createFloatingBallWindow(): void {
  if (floatingBallWindow && !floatingBallWindow.isDestroyed()) {
    return;
  }
  if (!configStore) return;
  const cfg = configStore.get().floatingBall;

  const winOpts: Electron.BrowserWindowConstructorOptions = {
    width: FB_WIDTH,
    height: FB_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  };

  // 持久化坐标校验：必须落在某个显示器工作区
  if (cfg.x != null && cfg.y != null && isRectVisible(cfg.x, cfg.y, FB_WIDTH, FB_HEIGHT)) {
    winOpts.x = cfg.x;
    winOpts.y = cfg.y;
  } else {
    // 默认贴光标所在屏右下角
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
    const wa = display.workArea;
    winOpts.x = wa.x + wa.width - FB_WIDTH - 20;
    winOpts.y = wa.y + wa.height - FB_HEIGHT - 20;
  }

  floatingBallWindow = new BrowserWindow(winOpts);
  floatingBallWindow.loadURL(`${RENDERER_BASE}/floating-ball.html`);
  floatingBallWindow.once('ready-to-show', () => floatingBallWindow?.show());

  // 拖动持久化（debounce 400ms，复用主窗口的 scheduleSave 模式）
  const saveFbBounds = () => {
    if (!floatingBallWindow || floatingBallWindow.isDestroyed() || !configStore) return;
    const b = floatingBallWindow.getBounds();
    configStore.update({ floatingBall: { x: b.x, y: b.y } });
  };
  let fbTimer: NodeJS.Timeout | null = null;
  const scheduleFbSave = () => {
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(saveFbBounds, 400);
  };
  floatingBallWindow.on('moved', scheduleFbSave);

  // 关闭按钮只是隐藏窗口（和主窗口一致）
  floatingBallWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      floatingBallWindow?.hide();
    }
  });

  floatingBallWindow.on('closed', () => {
    floatingBallWindow = null;
  });
}

function toggleFloatingBall(): void {
  if (!configStore) return;
  if (!configStore.get().floatingBall.enabled) {
    // 强制启用（首次从托盘点开）
    configStore.update({ floatingBall: { enabled: true, isVisible: true } });
    rebuildTray();
  }
  if (!floatingBallWindow || floatingBallWindow.isDestroyed()) {
    createFloatingBallWindow();
    return;
  }
  if (floatingBallWindow.isVisible()) {
    floatingBallWindow.hide();
    if (configStore) configStore.update({ floatingBall: { isVisible: false } });
  } else {
    floatingBallWindow.show();
    if (configStore) configStore.update({ floatingBall: { isVisible: true } });
  }
}

function hideFloatingBall(): void {
  if (floatingBallWindow && !floatingBallWindow.isDestroyed() && floatingBallWindow.isVisible()) {
    floatingBallWindow.hide();
    if (configStore) configStore.update({ floatingBall: { isVisible: false } });
  }
}

// 设置开关同步：启用则创建窗口并显示，禁用则隐藏并销毁
function syncFloatingBallFromConfig(): void {
  if (!configStore) return;
  const cfg = configStore.get().floatingBall;
  if (cfg.enabled && cfg.isVisible) {
    if (!floatingBallWindow || floatingBallWindow.isDestroyed()) {
      createFloatingBallWindow();
    } else if (!floatingBallWindow.isVisible()) {
      floatingBallWindow.show();
    }
  } else {
    if (floatingBallWindow && !floatingBallWindow.isDestroyed()) {
      floatingBallWindow.hide();
    }
  }
}

// 应用就绪
app.whenReady().then(() => {
  // 1. 加载配置
  configStore = new ConfigStore();

  // 2. 创建用量监控（注入到 server 中以便广播）
  usageMonitor = new UsageMonitor(configStore);

  // 3. 启动状态服务器（注入 configStore + usageMonitor 让它能广播用量）
  server = new StatusServer(WS_PORT, { configStore, usageMonitor });
  server.start();

  // 监听 LAN 模式变化，自动重启服务器以切换绑定地址
  configStore.onChange((cfg) => {
    const currentLan = server?.isLanEnabled();
    if (currentLan !== cfg.lanMode?.enabled) {
      console.log('[main] LAN mode changed, restarting server...');
      server?.restart();
    }
  });

  // 4. 启动用量轮询
  usageMonitor.start();

  // 5. 创建窗口和托盘
  createWindow();
  createTray();

  // 6. 如果上次退出时悬浮球是显示的，自动恢复
  syncFloatingBallFromConfig();

  // 6. 生成 Claude Code hooks helper 脚本（每次启动覆盖以保证最新）
  try { ensureHookHelper(); } catch (e) { console.warn('[hooks] ensureHookHelper failed:', (e as Error).message); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

// 所有窗口关闭时退出（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 不退出，保持托盘运行
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  isQuitting = true;
  clearTrayHoverTimers();
  if (trayHoverWindow && !trayHoverWindow.isDestroyed()) trayHoverWindow.destroy();
  trayHoverWindow = null;
  if (usageMonitor) usageMonitor.stop();
  if (server) server.stop();
});

// IPC 通信
ipcMain.handle(IPC_CHANNELS.TOGGLE_ALWAYS_ON_TOP, async (_event, enabled: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enabled);
  }
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
  if (!configStore) return null;
  const cfg = configStore.get();
  // 把 token 字段脱敏后再返回（保留真实值给保存按钮用，但不在 UI 上 echo）
  return {
    kimi:    { token: cfg.kimi.token    ? maskToken(cfg.kimi.token)    : '', enabled: cfg.kimi.enabled,    useProxy: cfg.kimi.useProxy },
    minimax: { token: cfg.minimax.token ? maskToken(cfg.minimax.token) : '', enabled: cfg.minimax.enabled, useProxy: cfg.minimax.useProxy },
    copilot: { token: cfg.copilot.token ? maskToken(cfg.copilot.token) : '', enabled: cfg.copilot.enabled, useProxy: cfg.copilot.useProxy },
    deepseek: { token: cfg.deepseek.token ? maskToken(cfg.deepseek.token) : '', enabled: cfg.deepseek.enabled, useProxy: cfg.deepseek.useProxy },
    codex:   { enabled: cfg.codex.enabled, useProxy: cfg.codex.useProxy },
    proxy: { url: cfg.proxy?.url || '' },
    intervalMinutes: cfg.intervalMinutes,
    hasKimiToken:    !!cfg.kimi.token,
    hasMiniMaxToken: !!cfg.minimax.token,
    hasCopilotToken: !!cfg.copilot.token,
    hasProxy:        !!(cfg.proxy?.url),
    kimiTokenExp: cfg.kimi.token ? decodeJwtExp(cfg.kimi.token) : null,
    copilotOAuth: isCopilotOAuthToken(cfg.copilot.token || ''),
    hasDeepseekToken: !!cfg.deepseek.token,
    codexAutoAvailable: codexAuthAvailable(),
    hooks: {
      enabled: { ...cfg.hooks.enabled },
      endpoint: { autoInstalled: !!cfg.hooks.endpoint.autoInstalled }
    },
    floatingBall: { enabled: !!cfg.floatingBall.enabled },
    thresholds: { ...cfg.thresholds },
    lanMode: { enabled: !!cfg.lanMode?.enabled, apiKey: cfg.lanMode?.apiKey || '' }
  };
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, partial: Record<string, unknown>) => {
  if (!configStore) return { success: false };
  // 协议：partial 中带 tokenChanged: true 表示用户改了 token 字段；
  // 没改/清空时按"未变更"处理，保留旧值；改为空串则视为清除。
  const current = configStore.get();
  const next: Record<string, unknown> = { ...partial };

  if (next.kimi && typeof next.kimi === 'object') {
    const kimi = next.kimi as Record<string, unknown>;
    if (kimi.tokenChanged) {
      next.kimi = { ...kimi, token: (kimi.token as string) || '' };
    } else {
      next.kimi = { ...kimi, token: current.kimi.token };
    }
    delete (next.kimi as Record<string, unknown>).tokenChanged;
  }
  if (next.minimax && typeof next.minimax === 'object') {
    const minimax = next.minimax as Record<string, unknown>;
    if (minimax.tokenChanged) {
      next.minimax = { ...minimax, token: (minimax.token as string) || '' };
    } else {
      next.minimax = { ...minimax, token: current.minimax.token };
    }
    delete (next.minimax as Record<string, unknown>).tokenChanged;
  }
  if (next.copilot && typeof next.copilot === 'object') {
    const copilot = next.copilot as Record<string, unknown>;
    if (copilot.tokenChanged) {
      next.copilot = { ...copilot, token: (copilot.token as string) || '' };
    } else {
      next.copilot = { ...copilot, token: current.copilot.token };
    }
    delete (next.copilot as Record<string, unknown>).tokenChanged;
  }
  if (next.deepseek && typeof next.deepseek === 'object') {
    const deepseek = next.deepseek as Record<string, unknown>;
    if (deepseek.tokenChanged) {
      next.deepseek = { ...deepseek, token: (deepseek.token as string) || '' };
    } else {
      next.deepseek = { ...deepseek, token: current.deepseek.token };
    }
    delete (next.deepseek as Record<string, unknown>).tokenChanged;
  }
  // proxy 使用同样的变更协议
  if (next.proxy && typeof next.proxy === 'object') {
    const proxy = next.proxy as Record<string, unknown>;
    if (proxy.urlChanged) {
      next.proxy = { ...proxy, url: (proxy.url as string) || '' };
    } else {
      next.proxy = { ...proxy, url: current.proxy?.url || '' };
    }
    delete (next.proxy as Record<string, unknown>).urlChanged;
  }

  // LAN 模式：首次开启时自动生成 apiKey
  if (next.lanMode && typeof next.lanMode === 'object') {
    const lm = next.lanMode as Record<string, unknown>;
    if (lm.enabled && !current.lanMode?.apiKey) {
      lm.apiKey = generateApiKey();
    } else if (lm.enabled && typeof lm.apiKey !== 'string') {
      lm.apiKey = current.lanMode?.apiKey || generateApiKey();
    }
  }

  configStore.update(next as Parameters<ConfigStore['update']>[0]);
  rebuildTray();
  if (usageMonitor) usageMonitor.checkAll();
  // 悬浮球开关同步：启用即开窗口；关闭即隐藏
  syncFloatingBallFromConfig();
  return { success: true };
});

function sendKimiLoginResult(r: { success: boolean; tokenExp?: number | null; error?: string }): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(IPC_CHANNELS.KIMI_LOGIN_RESULT, r);
  }
}

// Kimi 内嵌登录：打开 kimi.com，webRequest 拦截 apiv2 的 Authorization 头抓 token
ipcMain.handle(IPC_CHANNELS.KIMI_LOGIN_START, async () => {
  if (!configStore) return { success: false, error: 'no config' };
  let captured = false;
  openKimiLoginWindow(settingsWindow, (token) => {
    const exp = decodeJwtExp(token);
    // 忽略过期/非法 token，等网页端刷新后的下一个
    if (!exp || exp * 1000 <= Date.now()) return;
    captured = true;
    const current = configStore!.get().kimi.token;
    const currentExp = current ? decodeJwtExp(current) : null;
    if (token !== current && (!currentExp || exp > currentExp)) {
      configStore!.update({ kimi: { token } });
      rebuildTray();
      if (usageMonitor) usageMonitor.checkAll();
    }
    sendKimiLoginResult({ success: true, tokenExp: exp });
    closeKimiLoginWindow();
  }, () => {
    if (!captured) sendKimiLoginResult({ success: false, error: '窗口已关闭，未获取到 Token' });
  });
  return { success: true };
});

function sendCopilotDeviceResult(r: { success: boolean; error?: string }): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send(IPC_CHANNELS.COPILOT_DEVICE_RESULT, r);
  }
}

ipcMain.handle(IPC_CHANNELS.COPILOT_DEVICE_START, async () => {
  if (!configStore) return { success: false, error: 'no config' };
  try {
    copilotDeviceCancelled = false;
    const proxy = parseProxyUrl(configStore.get().proxy?.url || '');
    const info = await startDeviceFlow(proxy);
    // 自动打开浏览器授权页
    shell.openExternal(info.verificationUri).catch(() => {});
    // 后台轮询，完成后写配置并通知设置窗口
    pollDeviceFlow(info, proxy, () => copilotDeviceCancelled)
      .then((token) => {
        configStore!.update({ copilot: { token } });
        if (usageMonitor) usageMonitor.checkAll();
        rebuildTray();
        sendCopilotDeviceResult({ success: true });
      })
      .catch((e: Error) => {
        if (e.message !== 'cancelled') {
          sendCopilotDeviceResult({ success: false, error: e.message });
        }
      });
    return { success: true, userCode: info.userCode, verificationUri: info.verificationUri };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
});

ipcMain.handle(IPC_CHANNELS.COPILOT_DEVICE_CANCEL, async () => {
  copilotDeviceCancelled = true;
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_CLOSE, async () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN, async () => {
  openSettingsWindow();
});

ipcMain.handle(IPC_CHANNELS.QR_OPEN, async () => {
  await openQrWindow();
});

// 悬浮球：显示/隐藏（托盘和 preload 都走这里）
ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_TOGGLE, async () => {
  toggleFloatingBall();
});

// 悬浮球：单击 = 切到主窗口
ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_OPEN_MAIN, async () => {
  // 悬浮球本身可以被隐藏（自身销毁）—— 切主窗口前先关悬浮球
  hideFloatingBall();
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

// 悬浮球：读取当前状态
ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_GET_STATE, async () => {
  if (!configStore) return { visible: false, enabled: false };
  const cfg = configStore.get().floatingBall;
  return {
    visible: !!(floatingBallWindow && !floatingBallWindow.isDestroyed() && floatingBallWindow.isVisible()),
    enabled: !!cfg.enabled
  };
});

// 主窗口通知：某 cwd 的 pending 已被消费
ipcMain.handle(IPC_CHANNELS.FLOATING_BALL_NOTIFY_CLEARED, async (_event, cwd: string) => {
  if (server && typeof cwd === 'string') {
    server.clearPendingByCwd(cwd);
  }
});

// 主窗口调整大小（保持宽度+位置，只调高度。多屏下 setSize 会被某些 Windows DPI
// 组合重定位，所以这里用 setBounds 把 x/y 一起锁死）
ipcMain.handle(IPC_CHANNELS.WINDOW_RESIZE, async (_event, { height }: { height: number }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    mainWindow.setBounds({ x: b.x, y: b.y, width: b.width, height });
  }
});

// 渲染层启动时读窗口状态（主要为了同步 isCompact）
ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, async () => {
  if (!configStore) return null;
  const w = configStore.get().window || { width: 240, height: 550, isCompact: true };
  return { width: w.width, height: w.height, isCompact: w.isCompact !== false };
});

// 渲染层切换简略模式后持久化 isCompact
ipcMain.handle(IPC_CHANNELS.WINDOW_SET_COMPACT, async (_event, isCompact: boolean) => {
  if (!configStore) return;
  configStore.update({ window: { isCompact: !!isCompact } });
});

function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

// ==================== Claude Code Hooks ====================

// 生成 hook helper 脚本到 ~/.ai-status-monitor/claude-hook.js
// 跨平台：node 内置 http，无 curl/shell 引号依赖
function ensureHookHelper(): void {
  if (!fs.existsSync(HOOK_HELPER_DIR)) {
    fs.mkdirSync(HOOK_HELPER_DIR, { recursive: true });
  }
  const script = `#!/usr/bin/env node
// Generated by ai-assistant-status-monitor — do not edit, will be overwritten on app start
const http = require('http');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { data += c; if (data.length > 65536) process.exit(0); });
process.stdin.on('end', () => {
  const req = http.request({
    host: '127.0.0.1', port: ${WS_PORT}, path: '/api/hooks/claude',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    timeout: 1500
  }, (res) => res.resume());
  req.on('error', () => {});      // 静默：app 没开也别 block claude
  req.on('timeout', () => req.destroy());
  req.write(data); req.end();
});
setTimeout(() => process.exit(0), 2000); // 兜底退出
`;
  fs.writeFileSync(HOOK_HELPER_PATH, script, 'utf8');
  if (process.platform !== 'win32') {
    try { fs.chmodSync(HOOK_HELPER_PATH, 0o755); } catch { /* ignore */ }
  }
}

// 生成 settings.json 里要粘贴的 hooks 片段（只含已 enabled 的事件）
// enabledOverride 可选：渲染层未保存的勾选状态用它覆盖（"刷新片段"实时反映勾选）
function buildHooksSnippet(enabledOverride?: Record<string, boolean>): string {
  if (!configStore) return '';
  const persisted = configStore.get().hooks.enabled;
  const enabled = (enabledOverride && typeof enabledOverride === 'object')
    ? { ...persisted, ...enabledOverride }
    : persisted;
  // hook command 用绝对路径，JSON.stringify 自动处理 Windows 反斜杠转义
  const cmd = `node ${JSON.stringify(HOOK_HELPER_PATH)}`;
  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: cmd }] };
  const hooks: Record<string, unknown[]> = {};
  for (const ev of HOOK_EVENTS) {
    if (enabled[ev as keyof typeof enabled]) hooks[ev] = [hookEntry];
  }
  return JSON.stringify({ hooks }, null, 2);
}

// 读 ~/.claude/settings.json：不存在返回 {}，损坏返回错误（不强改）
function readClaudeSettings(): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return { ok: true, data: {} };
  let raw: string;
  try {
    raw = fs.readFileSync(CLAUDE_SETTINGS, 'utf8');
  } catch (e) {
    return { ok: false, error: 'read failed: ' + (e as Error).message };
  }
  try {
    return { ok: true, data: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    // 损坏：备份到 .corrupt-<ts>，拒绝继续
    const bak = CLAUDE_SETTINGS + '.corrupt-' + Date.now();
    try { fs.copyFileSync(CLAUDE_SETTINGS, bak); } catch { /* ignore */ }
    return { ok: false, error: `settings.json 解析失败，已备份为 ${path.basename(bak)}` };
  }
}

// 原子写：tmp + rename（mirror ConfigStore._save）
function writeClaudeSettingsAtomic(obj: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = CLAUDE_SETTINGS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, CLAUDE_SETTINGS);
}

ipcMain.handle(IPC_CHANNELS.HOOKS_GET_SNIPPET, async (_event, enabledOverride?: Record<string, boolean>) => {
  if (!configStore) return null;
  return {
    snippet: buildHooksSnippet(enabledOverride),
    autoInstalled: !!configStore.get().hooks.endpoint.autoInstalled,
    helperPath: HOOK_HELPER_PATH
  };
});

ipcMain.handle(IPC_CHANNELS.HOOKS_INSTALL, async (): Promise<HooksInstallResult> => {
  if (!configStore) return { success: false, error: 'configStore unavailable' };
  try {
    ensureHookHelper();
  } catch (e) {
    return { success: false, error: 'helper 脚本写入失败: ' + (e as Error).message };
  }

  const r = readClaudeSettings();
  if (!r.ok) return { success: false, error: r.error };
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const hooksData = (data.hooks && typeof data.hooks === 'object' ? data.hooks : {}) as Record<string, unknown[]>;
  data.hooks = hooksData;

  // 首次 install 前备份
  if (fs.existsSync(CLAUDE_SETTINGS) && !fs.existsSync(CLAUDE_SETTINGS_BAK)) {
    try { fs.copyFileSync(CLAUDE_SETTINGS, CLAUDE_SETTINGS_BAK); } catch { /* ignore */ }
  }

  const enabled = configStore.get().hooks.enabled;
  const cmd = `node ${JSON.stringify(HOOK_HELPER_PATH)}`;
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const ev of HOOK_EVENTS) {
    if (!enabled[ev as keyof typeof enabled]) continue;

    if (hooksData[ev] === undefined) {
      hooksData[ev] = [];
    } else if (!Array.isArray(hooksData[ev])) {
      return { success: false, error: `~/.claude/settings.json 中 hooks.${ev} 不是数组，拒绝改写以保留你的配置` };
    }

    const already = (hooksData[ev] as Array<Record<string, unknown>>).some((entry) =>
      Array.isArray(entry.hooks) && entry.hooks.some((h: Record<string, unknown>) => typeof h.command === 'string' && (h.command as string).includes(HOOK_MARKER))
    );
    if (already) {
      skipped.push(ev);
      continue;
    }

    (hooksData[ev] as Array<Record<string, unknown>>).push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
    installed.push(ev);
  }

  try {
    writeClaudeSettingsAtomic(data);
  } catch (e) {
    return { success: false, error: 'settings.json 写入失败: ' + (e as Error).message };
  }
  configStore.update({ hooks: { endpoint: { autoInstalled: true } } });
  return { success: true, installed, skipped };
});

ipcMain.handle(IPC_CHANNELS.HOOKS_UNINSTALL, async (): Promise<HooksUninstallResult> => {
  if (!configStore) return { success: false, error: 'configStore unavailable' };
  if (!fs.existsSync(CLAUDE_SETTINGS)) {
    configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
    return { success: true, removed: 0 };
  }

  const r = readClaudeSettings();
  if (!r.ok) return { success: false, error: r.error };
  const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const hooksData = (data.hooks && typeof data.hooks === 'object' ? data.hooks : {}) as Record<string, unknown[]>;
  if (!data.hooks || typeof data.hooks !== 'object') {
    configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
    return { success: true, removed: 0 };
  }

  let removed = 0;
  for (const ev of Object.keys(hooksData)) {
    const arr = hooksData[ev];
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      const isOurs = Array.isArray(e.hooks)
        && e.hooks.some((h: unknown) => typeof (h as Record<string, unknown>).command === 'string' && ((h as Record<string, unknown>).command as string).includes(HOOK_MARKER));
      if (isOurs) removed += 1;
      return !isOurs;
    });
    if (kept.length === 0) delete hooksData[ev];
    else hooksData[ev] = kept;
  }
  if (Object.keys(hooksData).length === 0) delete data.hooks;

  try {
    writeClaudeSettingsAtomic(data);
  } catch (e) {
    return { success: false, error: 'settings.json 写入失败: ' + (e as Error).message };
  }
  configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
  return { success: true, removed };
});
