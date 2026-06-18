# AI 助手状态监控面板

一个轻量级 Electron 桌面应用，实时展示 **Claude Code** 各项目的最近活跃时间，以及 **Kimi / MiniMax / Copilot** 的 API 用量余量。

## 功能特性

- **Claude Code 项目监控** —— 扫描 `~/.claude/projects/` 下的对话记录，按时间倒序列出各项目距上次 assistant 响应的间隔
  - `< 5min` 绿色（新鲜）
  - `< 1h` 黄色（ warn ）
  - 其他灰色（ stale ）
  - 支持按 5h / 8h / 12h / 24h / 3d / 7d / 30d / All 过滤

- **Claude Code Hooks 事件推送** —— 接收 Claude Code 的 `Notification` / `Stop` / `PreToolUse` 事件，在项目行上显示红点提示，等待用户响应

- **AI 用量监控** —— 配置 Token/Cookie 后，定时轮询以下平台的用量余量：
  - **Kimi** —— 总配额 / 周配额 / 5h 窗口配额
  - **MiniMax** —— 5h 窗口 / 周配额
  - **GitHub Copilot** —— Premium 交互次数余量

- **界面特性**
  - 无边框毛玻璃设计，支持拖拽移动
  - 始终置顶（可切换）
  - 简略 / 完整 双模式切换
  - 系统托盘菜单（显示/隐藏、用量开关、刷新周期、Token 设置）
  - 窗口大小、位置、模式跨重启持久化，多显示器感知

## 技术栈

- **Electron** —— 跨平台桌面应用框架
- **Vue 3 + TypeScript + Vite** —— 渲染层（单文件组件 + Composition API）
- **WebSocket** —— 主进程与渲染层的实时推送
- **Node.js fs/child_process** —— 本地 jsonl 文件扫描
- **axios** —— 用量 API 轮询

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式（带 DevTools）

```bash
npm run dev
```

Vite 开发服务器运行在 `5173`，Electron 主进程自动等待并加载。

### 3. 生产模式

```bash
npm start
```

先构建渲染层产物到 `src/renderer/dist/`，再启动 Electron。

### 4. 打包发布

```bash
npm run build
```

使用 `electron-builder` 输出到 `dist/`：
- Windows: `portable`
- macOS: `dmg`
- Linux: `AppImage`

## Claude Code 配置

### 自动安装 Hooks（推荐）

1. 右键点击系统托盘图标 → **设置 Token…**
2. 在设置窗口的 **Claude Code Hooks** 标签页中：
   - 勾选需要监听的事件（`Notification` / `Stop` / `PreToolUse`）
   - 点击 **Install Hooks**
   - 应用会自动将 hook helper 写入 `~/.ai-status-monitor/claude-hook.js`，并修改 `~/.claude/settings.json`
3. 之后每次 Claude Code 触发对应事件，面板即会收到推送并在对应项目上显示红点

### 手动配置（备用）

在 Claude Code 中执行：

```
/config set statusLine "node ~/.ai-status-monitor/claude-hook.js"
```

或参考 `scripts/status-reporter.js --claude-stdin` 自行对接。

## 用量监控配置

1. 右键托盘 → **设置 Token…**
2. 填入各平台 Token/Cookie：
   - **Kimi**: `Authorization: Bearer <token>` 中的 token
   - **MiniMax**: API Key
   - **Copilot**: 从浏览器开发者工具复制的 Cookie 整段字符串
3. 勾选启用对应平台，设置刷新周期（5/10/15/30/60 分钟）
4. 可选：配置代理 URL（支持带认证的 HTTP/HTTPS 代理）

## 项目结构

```
ai-assistant-status-monitor/
├── package.json
├── README.md
├── scripts/
│   ├── claude-status.sh         # macOS/Linux Claude 上报脚本（历史兼容）
│   ├── claude-status.ps1        # Windows Claude 上报脚本（历史兼容）
│   └── status-reporter.js       # 跨平台 Node.js 上报脚本
└── src/
    ├── main.js                  # Electron 主进程：BrowserWindow、Tray、IPC
    ├── preload.js               # contextBridge 安全预加载
    ├── server.js                # HTTP + WebSocket 服务器（端口 3456）
    ├── detector.js              # Claude Code 项目 jsonl 扫描器
    ├── usage-monitor.js         # Kimi / MiniMax / Copilot 用量轮询
    ├── config.js                # 配置持久化（userData/config.json）
    └── renderer/
        ├── src/                  # Vue 3 源码（Vite 构建）
        │   ├── main.ts           # 主面板入口
        │   ├── settings.ts       # 设置窗口入口
        │   ├── App.vue           # 主面板根组件
        │   ├── Settings.vue      # 设置窗口根组件
        │   ├── components/
        │   │   ├── TitleBar.vue
        │   │   ├── ClaudeCard.vue     # Claude 项目列表卡片
        │   │   └── UsageCard.vue      # 用量监控卡片
        │   ├── composables/
        │   │   └── useWebSocket.ts
        │   ├── utils/
        │   │   ├── time.ts
        │   │   └── cwd.ts
        │   ├── types/
        │   │   ├── messages.ts
        │   │   └── electron.d.ts
        │   ├── styles/
        │   │   ├── main.css
        │   │   └── settings.css
        │   ├── index.html
        │   └── settings.html
        └── dist/                 # Vite 构建产物（由 electron-builder 打包）
```

## 状态检测原理

### Claude Code 项目活跃时间

1. 每 30 秒扫描 `~/.claude/projects/<project>/` 下的所有 `.jsonl` 文件
2. 读取文件尾部 8KB，反向搜索最近一条 `type=assistant && isSidechain!==true` 的记录
3. 提取 `timestamp` 作为该项目的最后响应时间
4. 项目显示名优先级：`cwd` 末级目录名 > `slug` > 项目目录 ID

### Claude Code Hooks

1. Claude Code 触发事件时，通过 `~/.claude/settings.json` 中配置的 `command` hook 调用 `claude-hook.js`
2. `claude-hook.js` 将事件 JSON POST 到 `http://127.0.0.1:3456/api/hooks/claude`
3. 服务端校验事件白名单（`Notification` / `Stop` / `PreToolUse`）和配置 gating 后，通过 WebSocket 推送给前端
4. 前端按 `cwd` 匹配项目，显示红点；当项目的 `lastResponse` 时间比 hook 时间新时自动消除

## 注意事项

1. **Kimi Code CLI 支持已停用**：早期版本支持 Kimi 进程检测，当前版本已不再维护该功能
2. **Claude Code 项目目录**：需要 Claude Code 在 `~/.claude/projects/` 下生成 jsonl 对话记录，Claude Code CLI 和 VS Code 扩展均支持
3. **Windows 用户**：推荐开发模式下使用 `npm run dev`；生产打包输出为 `portable` 格式
4. **首次运行**：应用会自动创建配置目录和默认配置文件

## 许可证

MIT
