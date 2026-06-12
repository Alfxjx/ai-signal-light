import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StatusServer } from './server';
import { ConfigStore, VALID_INTERVALS, HOOK_EVENTS } from './config';
import { UsageMonitor } from './usage-monitor';
import { IPC_CHANNELS } from '../shared/types/ipc';
import type { HooksInstallResult, HooksUninstallResult } from '../shared/types/ipc';

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
let tray: Tray | null = null;
let server: StatusServer | null = null;
let configStore: ConfigStore | null = null;
let usageMonitor: UsageMonitor | null = null;
let isQuitting = false;

// 判断是否为开发模式
const isDev = process.argv.includes('--dev');

// dev 模式下渲染层走 Vite (5173)；生产环境走内嵌 server (3456)
// 注意：server 现在 bind 127.0.0.1，所以这里也用 127.0.0.1 防止 IPv6 解析跑偏
const RENDERER_BASE = isDev ? 'http://localhost:5173' : 'http://127.0.0.1:3456';

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
      label: '用量监控',
      submenu: [
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
        { label: '设置 Token…', click: () => openSettingsWindow() },
        { label: '刷新周期', submenu: intervalSubmenu },
        { type: 'separator' },
        { label: '立即刷新', click: () => usageMonitor && usageMonitor.checkAll() }
      ]
    },
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
  server = new StatusServer(3456, { configStore, usageMonitor });
  server.start();

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
    proxy: { url: cfg.proxy?.url || '' },
    intervalMinutes: cfg.intervalMinutes,
    hasKimiToken:    !!cfg.kimi.token,
    hasMiniMaxToken: !!cfg.minimax.token,
    hasCopilotToken: !!cfg.copilot.token,
    hasProxy:        !!(cfg.proxy?.url),
    hooks: {
      enabled: { ...cfg.hooks.enabled },
      endpoint: { autoInstalled: !!cfg.hooks.endpoint.autoInstalled }
    },
    floatingBall: { enabled: !!cfg.floatingBall.enabled }
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

  configStore.update(next as Parameters<ConfigStore['update']>[0]);
  rebuildTray();
  if (usageMonitor) usageMonitor.checkAll();
  // 悬浮球开关同步：启用即开窗口；关闭即隐藏
  syncFloatingBallFromConfig();
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_CLOSE, async () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN, async () => {
  openSettingsWindow();
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
    host: '127.0.0.1', port: 3456, path: '/api/hooks/claude',
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
