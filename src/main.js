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
  mainWindow = new BrowserWindow({
    width: 240,
    height: 550,
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
  });

  // 加载页面
  mainWindow.loadURL(RENDERER_BASE);
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    positionWindow();
  });

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

// 将窗口定位到屏幕右上角
function positionWindow() {
  if (!mainWindow) return;

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  const [winWidth] = mainWindow.getSize();

  mainWindow.setPosition(width - winWidth - 20, 20);
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
    height: 380,
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
    positionWindow();
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
    kimi:    { token: cfg.kimi.token    ? maskToken(cfg.kimi.token)    : '', enabled: cfg.kimi.enabled },
    minimax: { token: cfg.minimax.token ? maskToken(cfg.minimax.token) : '', enabled: cfg.minimax.enabled },
    copilot: { token: cfg.copilot.token ? maskToken(cfg.copilot.token) : '', enabled: cfg.copilot.enabled },
    intervalMinutes: cfg.intervalMinutes,
    hasKimiToken:    !!cfg.kimi.token,
    hasMiniMaxToken: !!cfg.minimax.token,
    hasCopilotToken: !!cfg.copilot.token
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

function maskToken(token) {
  if (!token) return '';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}
