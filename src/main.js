const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { StatusServer } = require('./server');
const { ConfigStore, VALID_INTERVALS } = require('./config');
const { UsageMonitor } = require('./usage-monitor');

// 保持全局引用，防止被垃圾回收
let mainWindow = null;
let settingsWindow = null;
let tray = null;
let server = null;
let configStore = null;
let usageMonitor = null;
let isQuitting = false;

// 判断是否为开发模式
const isDev = process.argv.includes('--dev');

// dev 模式下渲染层走 Vite (5173)；生产环境走内嵌 server (3456)
const RENDERER_BASE = isDev ? 'http://localhost:5173' : 'http://localhost:3456';

function createWindow() {
  const cfgWin = (configStore && configStore.get().window) || {};
  const persistedW = Number.isFinite(cfgWin.width) ? cfgWin.width : 240;
  const persistedH = Number.isFinite(cfgWin.height) ? cfgWin.height : 550;
  // 持久化的 x/y 必须落在当前某个显示器内才有效（防止断开副屏后窗口飞到屏外）
  const hasSavedPos = Number.isFinite(cfgWin.x) && Number.isFinite(cfgWin.y)
    && isRectVisible(cfgWin.x, cfgWin.y, persistedW, persistedH);

  const winOpts = {
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
    icon: path.join(__dirname, 'renderer', 'technical-support.png'),
    show: false               // 初始隐藏，等加载完成再显示
  };
  if (hasSavedPos) {
    winOpts.x = cfgWin.x;
    winOpts.y = cfgWin.y;
  }

  mainWindow = new BrowserWindow(winOpts);

  // 加载页面
  mainWindow.loadURL(RENDERER_BASE);
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 无持久化位置（首次启动或越界 fallback）才自动贴当前光标所在屏右上角
    if (!hasSavedPos) positionWindow();
  });

  // 持久化窗口尺寸/位置（debounce 400ms）
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || !configStore) return;
    const b = mainWindow.getBounds();
    configStore.update({ window: { width: b.width, height: b.height, x: b.x, y: b.y } });
  };
  let boundsTimer = null;
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
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 将窗口贴到「光标所在显示器」的右上角（fallback：primary）
function positionWindow() {
  if (!mainWindow) return;

  const { screen } = require('electron');
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  const wa = display.workArea; // 含 x/y/width/height，相对于全局坐标系

  const [winWidth] = mainWindow.getSize();
  mainWindow.setPosition(wa.x + wa.width - winWidth - 20, wa.y + 20);
}

// 判断一个矩形是否至少有一部分落在某个显示器的工作区内
function isRectVisible(x, y, w, h) {
  if (![x, y, w, h].every(Number.isFinite)) return false;
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const a = d.workArea;
    // 矩形重叠判断
    return x < a.x + a.width && x + w > a.x && y < a.y + a.height && y + h > a.y;
  });
}

// 创建系统托盘
function createTray() {
  const iconPath = path.join(__dirname, 'renderer', 'technical-support.png');

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('AI助手状态监控');

  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleWindow());
}

// 构造托盘菜单（每次 config 变化时调用以刷新勾选状态）
function buildTrayMenu() {
  const cfg = configStore.get();

  const intervalSubmenu = VALID_INTERVALS.map(m => ({
    label: `${m} 分钟`,
    type: 'radio',
    checked: cfg.intervalMinutes === m,
    click: () => {
      configStore.update({ intervalMinutes: m });
      rebuildTray();
    }
  }));

  return Menu.buildFromTemplate([
    { label: '显示/隐藏面板', click: () => toggleWindow() },
    { type: 'separator' },
    {
      label: '用量监控',
      submenu: [
        {
          label: '启用 Kimi',
          type: 'checkbox',
          checked: cfg.kimi.enabled,
          click: (item) => {
            configStore.update({ kimi: { enabled: item.checked } });
            rebuildTray();
          }
        },
        {
          label: '启用 MiniMax',
          type: 'checkbox',
          checked: cfg.minimax.enabled,
          click: (item) => {
            configStore.update({ minimax: { enabled: item.checked } });
            rebuildTray();
          }
        },
        {
          label: '启用 Copilot',
          type: 'checkbox',
          checked: cfg.copilot.enabled,
          click: (item) => {
            configStore.update({ copilot: { enabled: item.checked } });
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

function rebuildTray() {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

// 打开设置窗口（已存在则聚焦）
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 380,
    height: 460,
    parent: null,
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
    settingsWindow.center();
    settingsWindow.show();
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// 切换窗口显示/隐藏，必要时重建
function toggleWindow() {
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
ipcMain.handle('get-status', async () => {
  return server ? server.detector.getAllStatus() : {};
});

ipcMain.handle('toggle-always-on-top', async (event, enabled) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(enabled);
  }
});

ipcMain.handle('settings:get', async () => {
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
    hasProxy:        !!(cfg.proxy?.url)
  };
});

ipcMain.handle('settings:save', async (event, partial) => {
  if (!configStore) return { success: false };
  // 协议：partial 中带 tokenChanged: true 表示用户改了 token 字段；
  // 没改/清空时按"未变更"处理，保留旧值；改为空串则视为清除。
  const current = configStore.get();
  const next = { ...partial };

  if (next.kimi && typeof next.kimi === 'object') {
    if (next.kimi.tokenChanged) {
      next.kimi = { ...next.kimi, token: next.kimi.token || '' };
    } else {
      next.kimi = { ...next.kimi, token: current.kimi.token };
    }
    delete next.kimi.tokenChanged;
  }
  if (next.minimax && typeof next.minimax === 'object') {
    if (next.minimax.tokenChanged) {
      next.minimax = { ...next.minimax, token: next.minimax.token || '' };
    } else {
      next.minimax = { ...next.minimax, token: current.minimax.token };
    }
    delete next.minimax.tokenChanged;
  }
  if (next.copilot && typeof next.copilot === 'object') {
    if (next.copilot.tokenChanged) {
      next.copilot = { ...next.copilot, token: next.copilot.token || '' };
    } else {
      next.copilot = { ...next.copilot, token: current.copilot.token };
    }
    delete next.copilot.tokenChanged;
  }
  // proxy 使用同样的变更协议
  if (next.proxy && typeof next.proxy === 'object') {
    if (next.proxy.urlChanged) {
      next.proxy = { ...next.proxy, url: next.proxy.url || '' };
    } else {
      next.proxy = { ...next.proxy, url: current.proxy?.url || '' };
    }
    delete next.proxy.urlChanged;
  }

  configStore.update(next);
  rebuildTray();
  if (usageMonitor) usageMonitor.checkAll();
  return { success: true };
});

ipcMain.handle('settings:close', async () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

// 主窗口调整大小（保持宽度+位置，只调高度。多屏下 setSize 会被某些 Windows DPI
// 组合重定位，所以这里用 setBounds 把 x/y 一起锁死）
ipcMain.handle('window:resize', async (event, { height }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    mainWindow.setBounds({ x: b.x, y: b.y, width: b.width, height });
  }
});

// 渲染层启动时读窗口状态（主要为了同步 isCompact）
ipcMain.handle('window:get-state', async () => {
  if (!configStore) return null;
  const w = configStore.get().window || {};
  return { width: w.width, height: w.height, isCompact: w.isCompact !== false };
});

// 渲染层切换简略模式后持久化 isCompact
ipcMain.handle('window:set-compact', async (event, isCompact) => {
  if (!configStore) return;
  configStore.update({ window: { isCompact: !!isCompact } });
});

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}
