# AI状态监控

一个常驻本机的暗色仪表盘，盯住两件事：**AI 助手每个项目跑到哪一步**，以及 **七家 AI 平台的配额还剩多少**。

- 桌面端（Electron + Vue 3）：主面板常驻置顶，另有悬浮球 LED、桌面宠物、顶部吸附收起、托盘悬停速览
- 状态来源：Claude Code（扫 `~/.claude/projects/` 对话记录）+ Kimi Code (web)（连本机 `kimi web` 服务订阅实时会话）
- 配额：Kimi、MiniMax、GitHub Copilot、DeepSeek、Codex、火山方舟 Ark、小米 MiMo
- 手机端：原生 Android（Kotlin + Compose），扫码配对后局域网实时同步
- opencode 用户：另有 TUI 侧边栏插件，在终端里直接看用量

全程本地运行，没有自建服务器，Token 与配置只存在本机。

## 功能特性

### 项目状态

- **Claude Code 项目活跃时间** —— 每 30 秒扫描 `~/.claude/projects/**/*.jsonl`，取文件尾部 8KB 反向找最近一条 `type=assistant && isSidechain!==true` 记录，按距上次响应的间隔着色（`<5min` 绿 / `<1h` 黄 / 更久灰），支持 5h～All 过滤
- **Kimi Code (web) 实时状态** —— 连本机 `kimi web` 服务：WS `/api/v1/ws` 订阅事件 + 每 3 秒 REST `/api/v1/sessions` 校准。会话按 `metadata.cwd` 归并成目录行，头部聚合成 **待审核 > 编辑中 > 思考中 > 空闲** 四态；服务不可达时整卡隐藏
- **Kimi 通知气泡** —— 从 WS `tool.call.started` / `tool.result` 里捕获 `NotifyUser` 消息，在悬浮球右侧弹气泡，15 秒自动隐藏

### 界面形态

- **主面板** —— 无边框毛玻璃、小圆角、角标刻度线，置顶可切换，位置/大小/模式跨重启持久化
- **顶部吸附收起**（`edge-dock.ts`）—— 拖到屏幕顶边松手即吸附收起，屏内只剩 5px 底边把手；光标划到顶部触发带滑出，离开且窗口不忙就重新藏回去
- **悬浮球 LED** —— 拟物像素灯，把 Kimi Code 聚合态映射成 红闪（待审核）/ 黄常亮（编辑中）/ 黄呼吸（思考中）/ 绿微光（空闲）/ 灰灭（离线）；短按弹下拉（最近活跃项目 + Kimi 5h 用量），失焦 / Esc 收起；窗口 `focusable: false`，点它不抢 IDE 焦点
- **桌面宠物**（独立开关，可与悬浮球共存）—— 粘贴画廊命令（`awesome-codex-pet` slug / `codex-pets.net` zip / `petdex.dev`）导入 Codex 像素图集，主进程落盘到 `userData/pets/`，按官方 9 行动作表逐帧播放并跟随 Kimi 状态；单击打开本机 Kimi Web，长按 600ms 弹下拉，右键出原生菜单，可拖动且位置持久化
- **系统托盘** —— 显示/隐藏、用量开关、刷新周期菜单；鼠标悬停托盘图标弹出简易用量（四家 mini 进度条 + DeepSeek 余额 + 更新时间）
- **Claude Code Hooks 红点** —— 监听 `Notification` / `Stop` / `PreToolUse`，助手卡在需要确认的地方时对应项目亮红点；点项目或出现更新的响应即消除
- **可配置阈值** —— 进度条 warn / danger 阈值在设置里可调，存 `config.json` 随 WS 下发；百分比与进度条统一是 **已用 %**

### 用量监控

- 七家 provider 一屏排开，刷新周期可选 5 / 10 / 15 / 30 / 60 分钟
- 5h / 周 / 月窗口按重置时间算出**消耗节奏**（偏快 / 正常 / 偏慢）
- 火山方舟支持 AK/SK 官方 OpenAPI V4 签名（长期有效），cookie 通道作为回退

### 手机端

- 原生 Android（Kotlin + Compose + Hilt + Room），扫码配对后走局域网 WebSocket 同步
- 二维码只带 `{v, host, port, apiKey}`，配置由手机通过 WS 反向拉取精简 `MobileAppConfig`（火山 AK/SK 不会下发到手机）
- 用量页双列网格 / 单列详情切换，DeepSeek / MiMo 共用余额卡，阈值通知，浅色 / 深色 / 跟随系统主题

### opencode 插件

- `opencode-plugin/`：TUI 侧边栏显示 Kimi / MiniMax / 火山 / DeepSeek / MiMo 五家用量
- 只读 `%APPDATA%\AI状态监控\config.json`，**绝不写回**（cookie 续期由桌面应用独占）
- 5 分钟轮询 + 失败退避 + `/usage` 全量刷新 + 行尾单家刷新 + 可折叠（`/usage-toggle`）
- `opencode-usage-plugin-helper-cli/`：零依赖 CLI 助手（`init` / `set` / `doctor` / `install`），自助改配置与装插件

## 技术栈

- **Electron** —— 跨平台桌面容器，主进程 CommonJS（`tsc` → `dist/main/`）
- **Vue 3 + TypeScript + Vite** —— 渲染层（主面板 / 设置 / 悬浮球 / 下拉 / 托盘 / 宠物多个入口）
- **Node.js `http` + `ws`** —— 主进程内嵌 HTTP + WebSocket 服务（端口 `3456`），生产下同时托管渲染层静态资源
- **axios** —— 用量 API 轮询
- **Kotlin + Compose + Hilt + Room + Ktor** —— Android 伴侣
- **Solid + opentui** —— opencode TUI 插件
- **Vue 3 + Tailwind CSS** —— `landing/` 营销页（GitHub Pages 自动部署）

状态数据不走 IPC，全部经 WebSocket 推送。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

```bash
npm run build:main   # 首次必须先构建主进程，dev 不会自动重建
npm run dev          # Vite 5173 + Electron（--dev，独立 userData）
```

### 3. 生产模式

```bash
npm start            # 构建主进程 + 渲染层后启动 Electron
```

### 4. 打包发布

```bash
npm run build        # tsc + vite build + electron-builder
```

输出到 `dist/`：Windows `portable`、macOS `dmg`、Linux `AppImage`；版本号与 CHANGELOG 由 `commit-and-tag-version` 维护。

### 脚本一览

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite + Electron 开发模式 |
| `npm start` | 构建并启动生产模式 |
| `npm run build:main` | 只构建主进程（`tsc -p tsconfig.main.json`） |
| `npm run build:renderer` | `vue-tsc` 类型检查 + 构建渲染层 + 拷贝图标 |
| `npm run build` | 完整打包（electron-builder） |
| `npm run typecheck` | 渲染层 `vue-tsc` + 主进程 `tsc` |
| `npm test` | Vitest（`src/main/**`、`src/renderer/src/utils/**`） |
| `npm run release:dry-run` | 预览版本号与 changelog（只读） |
| `npm run release` | bump 版本 + 生成 CHANGELOG + 打 tag |
| `npm run landing:dev` / `landing:build` / `landing:preview` | 营销页开发 / 构建 / 预览 |

## 用量 provider 与鉴权

| 平台 | 鉴权方式 | 配额窗口 |
|---|---|---|
| Kimi | 开放平台 API Key（`GET /coding/v1/usages`） | 5h + 周 |
| MiniMax | 开放平台 API Key | 5h + 周 |
| GitHub Copilot | GitHub Device Flow OAuth（`copilot-auth.ts`） | Premium 交互次数 |
| DeepSeek | 平台 API Key | 余额 |
| Codex | 自动读 `~/.codex/auth.json`，过期自动刷新 | 主 / 次窗口（按 `windowSeconds` 显示 5h / 天 / 周）+ credits |
| 火山方舟 Ark | AK/SK 官方 OpenAPI V4 签名，cookie 通道回退 | 会话 / 周 / 月 |
| MiMo | 控制台会话 Cookie | 余额 |

> Kimi 用量走的是实验性接口，字段可能随版本变化。

## 项目结构

```
ai-signal-light/
├── src/
│   ├── main/                     # Electron 主进程（tsc → dist/main）
│   │   ├── main.ts               # 窗口（主面板/设置/悬浮球/下拉/托盘/QR/宠物）、托盘、IPC、Claude hooks 装卸
│   │   ├── preload.ts            # contextBridge（contextIsolation 开，nodeIntegration 关）
│   │   ├── server.ts             # 内嵌 HTTP + WebSocket（端口 3456），pendingByCwd、getConfig
│   │   ├── detector.ts           # Claude Code jsonl 扫描器
│   │   ├── kimi-monitor.ts       # Kimi Code (web) 实时状态（WS + REST，会话按 cwd 归并）
│   │   ├── usage-monitor.ts      # 七家配额轮询
│   │   ├── copilot-auth.ts       # GitHub Device Flow OAuth
│   │   ├── codex-credentials.ts  # ~/.codex/auth.json 读取与刷新
│   │   ├── volcengine-sign.ts    # 火山 OpenAPI V4 签名（与安卓端共用官方测试向量）
│   │   ├── config.ts             # userData/config.json 原子写
│   │   ├── pairing.ts            # 二维码载荷 + 局域网 IP 探测 + MobileAppConfig 投影
│   │   ├── edge-dock.ts          # 顶部吸附 / 收起 / 滑出状态机
│   │   └── pet-store.ts          # 宠物素材磁盘库（userData/pets/）
│   ├── renderer/src/             # Vue 3 渲染层（Vite → dist/renderer）
│   │   ├── App.vue / Settings.vue / FloatingBall.vue / Dropdown.vue / PetView.vue / TrayHover.vue
│   │   ├── components/           # TitleBar / ClaudeCard / KimiCard / UsageCard
│   │   ├── composables/          # useWebSocket（指数退避重连，上限 30s）/ useUsageState
│   │   ├── pet/                  # 画廊命令解析 + 安全 unzip + 官方图集逐帧播放器
│   │   └── utils/                # time / cwd / kimiFilter（含 *.test.ts）
│   └── shared/                   # 主进程与渲染层共享
│       ├── constants.ts          # WS_PORT = 3456 唯一来源
│       ├── types/                # websocket / config / ipc / usage / detector / kimi
│       └── utils/cwd.ts          # normalizeCwd（Windows 大小写不敏感）
├── android-app/                  # 原生 Android 伴侣（Kotlin + Compose + Hilt + Room）
├── opencode-plugin/              # opencode TUI 用量侧边栏插件
├── opencode-usage-plugin-helper-cli/  # 插件配置助手 CLI（零依赖）
├── landing/                      # 营销落地页（Vue 3 + Tailwind，GitHub Pages 自动部署）
└── scripts/copy-renderer-assets.js
```

## 状态检测原理

### Claude Code 项目活跃时间

1. 每 30 秒扫描 `~/.claude/projects/<project>/` 下所有 `.jsonl`
2. 读文件尾部 8KB，反向搜索最近一条 `type=assistant && isSidechain!==true` 记录
3. 取其 `timestamp` 作为该项目的最后响应时间
4. 显示名优先级：`cwd` 末级目录名 > `slug` > 项目目录 ID

### Claude Code Hooks

1. 应用把 hook helper 写到 `~/.ai-status-monitor/claude-hook.js`，并在 `~/.claude/settings.json` 注册 `Notification` / `Stop` / `PreToolUse`
2. hook 把事件 JSON POST 到 `http://127.0.0.1:3456/api/hooks/claude`
3. `StatusServer` 校验事件白名单与配置 gating，写入 `pendingByCwd` 并经 WS 广播 `pendingChanged`
4. 渲染层按 `cwd` 匹配项目显示红点；点击项目或出现更新的响应时清除

### Kimi Code (web) 实时状态

1. token 读 `~/.kimi-code/server.token`，端口读 `~/.kimi-code/server/instances/*.json` 自报 port（兜底从 58627 起探 100 个端口）
2. WS 连 `/api/v1/ws`，用 `Sec-WebSocket-Protocol: kimi-code.bearer.<token>` 鉴权，`ping` 回 `pong`
3. 每 3 秒 REST `/api/v1/sessions` 校准，会话按 `metadata.cwd` 归并成目录行，聚合优先级 待审核 > 编辑中 > 思考中 > 空闲（离线）
4. 主面板只显示**当日**活动过的目录，悬浮球下拉保留 3 天窗口，两者都强留「非空闲 / pending」的行

## 注意事项

1. **Kimi Code (web) 通道走的是实验性 API**，字段与事件名可能随 kimi 版本变化
2. **火山 AK/SK 不下发手机端**：安卓端另有同款 AK/SK 通道，但密钥需在手机设置里手填，重新扫码时会保留本机 AK/SK
3. **opencode 插件是只读消费方**：cookie / CSRF 续期回写由桌面应用独占，两边同时写会互相覆盖
4. **首次运行**会自动创建配置目录与默认配置文件；dev 与打包版用不同 `app.setName`，配置目录互相隔离
5. **Windows 用户**开发模式推荐 `npm run dev`；生产包为 `portable` 单文件

## 许可证

MIT
