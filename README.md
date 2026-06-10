# AI 助手状态监控面板

一个轻量级桌面应用，实时显示 **Kimi Code CLI** 和 **Claude Code** 的工作状态。

## 功能特性

- **三种状态显示**
  - 空闲（绿色）- AI 等待用户输入
  - 执行中（蓝色呼吸）- AI 正在思考/生成/执行工具
  - 等待判断（黄色闪烁）- AI 提出了建议，等待用户确认

- **实时更新** - WebSocket 推送，2秒刷新
- **系统托盘** - 最小化到托盘，不打扰工作
- **置顶显示** - 可设置为始终置顶
- **无边框设计** - 精致毛玻璃效果，支持拖拽

## 技术栈

- **Node.js + Electron** - 跨平台桌面应用
- **WebSocket** - 实时状态推送
- **进程监控** - 检测 AI 助手进程状态

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 根据你的 Claude Code 版本选择配置方式

#### A. Claude Code CLI 版（命令行版）

Claude Code CLI 支持 `/statusLine` 配置，可以将实时状态输出到自定义脚本。

**macOS / Linux:**
```
/config set statusLine "bash /path/to/scripts/claude-status.sh"
```

**Windows:**
```
/config set statusLine "node C:\path\to\scripts\status-reporter.js --claude-stdin"
```

#### B. Claude Code VS Code 插件版 ⭐ 你当前的情况

**VS Code 插件没有 `statusLine` 机制，使用手动状态切换：**

1. 启动监控面板（见步骤 3）
2. 面板会自动检测 VS Code 是否在运行
3. 鼠标悬停在 Claude Code 卡片上，会出现三个按钮：
   - 🟢 空闲 - Claude 等待你输入
   - 🔵 执行中 - Claude 正在思考/写代码
   - 🟡 等待判断 - Claude 问你 Yes/No
4. 点击对应按钮即可切换状态

> 💡 **使用技巧**: 可以把面板放在屏幕角落，Claude 开始干活时点一下 🔵，它问你问题时点一下 🟡

### 3. 配置 Kimi Code CLI 状态上报（可选）

Kimi Code CLI 目前没有官方 statusLine 机制，使用进程监控 + 状态文件。

**macOS / Linux:**
```bash
# 将 kimi-status.sh 加入 cron 或作为后台服务运行
*/1 * * * * /path/to/scripts/kimi-status.sh
```

**Windows:**
```powershell
# 在 PowerShell 中启动持续监控
node C:\path\to\scripts\status-reporter.js --watch
```

### 4. 启动监控面板

**开发模式**
```bash
npm run dev
```

**生产模式**
```bash
npm start
```

### 5. 打包发布

```bash
npm run build
```

## Windows 特别说明

### Kimi Code CLI 进程检测

Kimi Code CLI 在 Windows 上有两种安装方式，对应不同的进程名：

| 安装方式 | 进程名 | 检测方法 |
|---------|--------|---------|
| npm 全局安装 (`npm i -g kimi`) | `node.exe` | 通过命令行参数判断是否包含 "kimi" |
| 独立安装包 | `kimi.exe` | 直接检测进程名 |

本应用会自动尝试两种检测方式，确保能正确识别。

### 状态文件位置

Windows 上状态文件存储在：
```
C:\Users\<用户名>\.ai-status-monitor\
  ├── claude-status.json
  └── kimi-status.json
```

### 权限问题

如果 PowerShell 脚本执行被禁止，请以管理员身份运行：
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 状态检测原理

### Claude Code

1. **进程检测** - 检测 `claude` / `claude.exe` 进程是否存在
2. **状态文件** - 读取 `~/.ai-status-monitor/claude-status.json`
3. **JSON 分析** - 根据 `pendingToolUses`、`isGenerating` 等字段判断状态

### Kimi Code CLI

1. **进程检测** - 检测 `kimi` / `kimi.exe` / `node.exe`(带 kimi 参数) 进程
2. **状态文件** - 读取 `~/.ai-status-monitor/kimi-status.json`
3. **推断状态** - 基于进程存在推断运行状态

## 项目结构

```
ai-assistant-status-monitor/
├── package.json
├── README.md
├── scripts/
│   ├── claude-status.sh         # macOS/Linux Claude 上报脚本
│   ├── claude-status.ps1        # Windows Claude 上报脚本 (PowerShell)
│   ├── kimi-status.sh           # macOS/Linux Kimi 检测脚本
│   ├── kimi-status.ps1          # Windows Kimi 检测脚本 (PowerShell)
│   └── status-reporter.js       # 跨平台 Node.js 上报脚本 (推荐)
└── src/
    ├── main.js                  # Electron 主进程
    ├── preload.js             # 安全预加载脚本
    ├── server.js              # WebSocket + HTTP 服务器
    ├── detector.js              # AI 状态检测器
    └── renderer/
        ├── index.html           # 前端页面
        ├── style.css            # 样式
        └── app.js               # 前端逻辑
```

## 扩展更多 AI 助手

要添加新的 AI 助手支持，只需修改 `src/detector.js`：

```javascript
// 1. 在构造函数中注册新助手
this.assistants.set('cursor', {
  name: 'Cursor',
  type: 'cursor',
  status: Status.IDLE,
  lastUpdate: null,
  details: {},
  pid: null
});

// 2. 添加检测方法
async checkCursor() {
  const pid = await this.findProcess('cursor');
  // ... 状态分析逻辑
}

// 3. 在 checkAll() 中调用
async checkAll() {
  await this.checkClaude();
  await this.checkKimi();
  await this.checkCursor();  // 新增
}
```

同时在 `src/renderer/index.html` 中添加对应的卡片。

## 注意事项

1. **Claude Code statusLine** 需要 v0.2.0+ 版本支持
2. **Kimi Code CLI** 状态检测基于进程监控，精确状态需要配合日志分析
3. **Windows 用户** 推荐使用 Node.js 版本的 `status-reporter.js`，无需额外配置
4. 首次运行时会自动创建 `~/.ai-status-monitor` 目录

## 许可证

MIT
