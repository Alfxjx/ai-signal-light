const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { StatusServer } = require('./server');
const { ConfigStore, VALID_INTERVALS, HOOK_EVENTS } = require('./config');
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
// 注意：server 现在 bind 127.0.0.1，所以这里也用 127.0.0.1 防止 IPv6 解析跑偏
const RENDERER_BASE = isDev ? 'http://localhost:5173' : 'http://127.0.0.1:3456';

// Claude Code hooks 相关常量
const HOOK_HELPER_DIR = path.join(os.homedir(), '.ai-status-monitor');
const HOOK_HELPER_PATH = path.join(HOOK_HELPER_DIR, 'claude-hook.js');
const HOOK_MARKER = 'claude-hook.js'; // settings.json 里识别我们写入条目的子串
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_SETTINGS_BAK = CLAUDE_SETTINGS + '.bak';

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
    width: 720,
    height: 600,
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

  // 6. 生成 Claude Code hooks helper 脚本（每次启动覆盖以保证最新）
  try { ensureHookHelper(); } catch (e) { console.warn('[hooks] ensureHookHelper failed:', e.message); }

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
    hasProxy:        !!(cfg.proxy?.url),
    hooks: {
      enabled: { ...cfg.hooks.enabled },
      endpoint: { autoInstalled: !!cfg.hooks.endpoint.autoInstalled }
    }
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

ipcMain.handle('settings:open', async () => {
  openSettingsWindow();
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

// ==================== Claude Code Hooks ====================

// 生成 hook helper 脚本到 ~/.ai-status-monitor/claude-hook.js
// 跨平台：node 内置 http，无 curl/shell 引号依赖
function ensureHookHelper() {
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
    try { fs.chmodSync(HOOK_HELPER_PATH, 0o755); } catch (e) {}
  }
}

// 生成 settings.json 里要粘贴的 hooks 片段（只含已 enabled 的事件）
// enabledOverride 可选：渲染层未保存的勾选状态用它覆盖（"刷新片段"实时反映勾选）
function buildHooksSnippet(enabledOverride) {
  if (!configStore) return '';
  const persisted = configStore.get().hooks.enabled;
  const enabled = (enabledOverride && typeof enabledOverride === 'object')
    ? { ...persisted, ...enabledOverride }
    : persisted;
  // hook command 用绝对路径，JSON.stringify 自动处理 Windows 反斜杠转义
  const cmd = `node ${JSON.stringify(HOOK_HELPER_PATH)}`;
  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: cmd }] };
  const hooks = {};
  for (const ev of HOOK_EVENTS) {
    if (enabled[ev]) hooks[ev] = [hookEntry];
  }
  return JSON.stringify({ hooks }, null, 2);
}

// 读 ~/.claude/settings.json：不存在返回 {}，损坏返回错误（不强改）
function readClaudeSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return { ok: true, data: {} };
  let raw;
  try {
    raw = fs.readFileSync(CLAUDE_SETTINGS, 'utf8');
  } catch (e) {
    return { ok: false, error: 'read failed: ' + e.message };
  }
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    // 损坏：备份到 .corrupt-<ts>，拒绝继续
    const bak = CLAUDE_SETTINGS + '.corrupt-' + Date.now();
    try { fs.copyFileSync(CLAUDE_SETTINGS, bak); } catch (e2) {}
    return { ok: false, error: `settings.json 解析失败，已备份为 ${path.basename(bak)}` };
  }
}

// 原子写：tmp + rename（mirror ConfigStore._save）
function writeClaudeSettingsAtomic(obj) {
  const dir = path.dirname(CLAUDE_SETTINGS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = CLAUDE_SETTINGS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, CLAUDE_SETTINGS);
}

ipcMain.handle('hooks:get-snippet', async (event, enabledOverride) => {
  if (!configStore) return null;
  return {
    snippet: buildHooksSnippet(enabledOverride),
    autoInstalled: !!configStore.get().hooks.endpoint.autoInstalled,
    helperPath: HOOK_HELPER_PATH
  };
});

ipcMain.handle('hooks:install', async () => {
  if (!configStore) return { success: false, error: 'configStore unavailable' };
  try {
    ensureHookHelper();
  } catch (e) {
    return { success: false, error: 'helper 脚本写入失败: ' + e.message };
  }

  const r = readClaudeSettings();
  if (!r.ok) return { success: false, error: r.error };
  const data = r.data && typeof r.data === 'object' ? r.data : {};
  if (!data.hooks || typeof data.hooks !== 'object') data.hooks = {};

  // 首次 install 前备份
  if (fs.existsSync(CLAUDE_SETTINGS) && !fs.existsSync(CLAUDE_SETTINGS_BAK)) {
    try { fs.copyFileSync(CLAUDE_SETTINGS, CLAUDE_SETTINGS_BAK); } catch (e) {}
  }

  const enabled = configStore.get().hooks.enabled;
  const cmd = `node ${JSON.stringify(HOOK_HELPER_PATH)}`;
  const installed = [];
  const skipped = [];

  for (const ev of HOOK_EVENTS) {
    if (!enabled[ev]) continue;

    if (data.hooks[ev] === undefined) {
      data.hooks[ev] = [];
    } else if (!Array.isArray(data.hooks[ev])) {
      return { success: false, error: `~/.claude/settings.json 中 hooks.${ev} 不是数组，拒绝改写以保留你的配置` };
    }

    const already = data.hooks[ev].some((entry) =>
      Array.isArray(entry.hooks) && entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_MARKER))
    );
    if (already) {
      skipped.push(ev);
      continue;
    }

    data.hooks[ev].push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
    installed.push(ev);
  }

  try {
    writeClaudeSettingsAtomic(data);
  } catch (e) {
    return { success: false, error: 'settings.json 写入失败: ' + e.message };
  }
  configStore.update({ hooks: { endpoint: { autoInstalled: true } } });
  return { success: true, installed, skipped };
});

ipcMain.handle('hooks:uninstall', async () => {
  if (!configStore) return { success: false, error: 'configStore unavailable' };
  if (!fs.existsSync(CLAUDE_SETTINGS)) {
    configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
    return { success: true, removed: 0 };
  }

  const r = readClaudeSettings();
  if (!r.ok) return { success: false, error: r.error };
  const data = r.data && typeof r.data === 'object' ? r.data : {};
  if (!data.hooks || typeof data.hooks !== 'object') {
    configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
    return { success: true, removed: 0 };
  }

  let removed = 0;
  for (const ev of Object.keys(data.hooks)) {
    const arr = data.hooks[ev];
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((entry) => {
      const isOurs = Array.isArray(entry.hooks)
        && entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
      if (isOurs) removed += 1;
      return !isOurs;
    });
    if (kept.length === 0) delete data.hooks[ev];
    else data.hooks[ev] = kept;
  }
  if (Object.keys(data.hooks).length === 0) delete data.hooks;

  try {
    writeClaudeSettingsAtomic(data);
  } catch (e) {
    return { success: false, error: 'settings.json 写入失败: ' + e.message };
  }
  configStore.update({ hooks: { endpoint: { autoInstalled: false } } });
  return { success: true, removed };
});
