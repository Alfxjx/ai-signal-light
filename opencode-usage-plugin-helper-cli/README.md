# opencode-usage-plugin-helper-cli

`opencode-plugin`（opencode 用量侧边栏插件）的配置助手。

**给谁用**：想在 opencode 里看用量、但**没装「AI状态监控」桌面程序**的用户。
插件只读 `config.json`，而那个文件平时由桌面程序生成 —— 这个 CLI 负责把它建起来、写入凭据、体检环境。

> 装了桌面程序的话你不需要它：桌面程序已经把 `config.json` 写好了，直接装插件即可。

## 快速开始

```powershell
cd opencode-usage-plugin-helper-cli
npm install
npm run build

# 1. 在插件读取的路径生成配置骨架
node dist/index.js init

# 2. 写入凭据（掩码输入，不会回显）
node dist/index.js set kimi

# 3. 生成 opencode 的插件转发文件
node dist/index.js install

# 4. 体检
node dist/index.js doctor
```

`doctor` 全绿后重启 opencode，侧边栏就会出现用量面板。

## 命令

| 命令 | 作用 |
|---|---|
| `init` | 在插件读取的路径生成 `config.json` 骨架（五家全 `enabled: false`）。已存在则拒绝，加 `--force` 重置 |
| `set <provider>` | 写入某家凭据，掩码输入。配齐后自动 `enabled: true` |
| `doctor` | 体检：配置路径 / 文件合法性 / 每家缺什么 / 转发文件 / `node_modules` |
| `install` | 生成 `~/.config/opencode/plugins/usage-sidebar/tui.ts` 转发文件。已存在则备份后覆盖（`--force`） |
| `where` | 只打印相关路径 |

`provider`：`kimi` `minimax` `volcengine` `deepseek` `mimo`

### 选项

- `--force`：覆盖已存在的文件（`init` / `install`）
- `--token <值>`：非交互写入（仅单字段的 provider，用于脚本 / CI）
- `--json`：`doctor` 以 JSON 输出（无 ANSI，机器可读）

## 需要什么凭据

| Provider | 字段 | 值从哪拿 |
|---|---|---|
| Kimi | `token` | Kimi 开放平台 → API Key，形如 `sk-kimi-…` |
| MiniMax | `token` | MiniMax 开放平台 → API Key |
| DeepSeek | `token` | DeepSeek 开放平台 → API Key，形如 `sk-…` |
| MiMo | `token` | platform.xiaomimimo.com 登录后复制**整条 Cookie**。调模型的 `sk-` key 查不到余额 |
| 火山 | `accessKey` + `secretKey` | 火山控制台 → 访问控制 → 访问密钥 → 创建密钥对 |

### 为什么火山只要 AK/SK

插件本身也支持 `cookie` + `csrfToken` 兜底，但那条通道依赖控制台登录态，
**约一周就失效**，而插件是只读的（故意不回写 cookie，避免和桌面程序互相覆盖），
过期后只能报错。给一个必然过期的选项等于埋雷，所以 CLI 不暴露它。

Secret Key **只在创建时显示一次**，务必当场保存。

## 前提

1. **`npm install --legacy-peer-deps`（在 `opencode-plugin/` 目录下）**
   这是**运行时**前提，不只是开发前提：转发文件在 `~/.config` 下，
   Bun 会从那里向上解析 `@opencode/plugin/tui` 与 `solid-js`。
   删掉 `node_modules` 插件就加载失败。

2. **转发文件**（`install` 自动生成）
   opencode 只自动扫描 `~/.config/opencode/plugins/`，写进 `cli.json` 的 `plugins` 实测**不生效**。

3. **重开 opencode** 让插件生效。

## 它怎么保证不弄坏你的配置

`config.json` 是和桌面程序**共用**的文件，所以有两道保险：

- **原子写**：先写 `.tmp` 再 `rename`。桌面程序可能同时在读，半个 JSON 会让它解析失败。
- **只动自己管的键**：`window` / `pet` / `floatingBall` / `lanMode` / `hooks` / `intervalMinutes`
  这些桌面程序专属字段**一律原样保留**。
  `init --force` 也只重置五家 provider 节点，不碰其余字段（`thresholds` 作为用户偏好保留）。
  这条有回归测试盯着 —— 早期版本整文件覆写，真机 smoke 时把 `pet` 和 `lanMode` 清空过。

`set` 会同时更新 `enabled`：凭据配齐才置 `true`，配不齐保持 `false`，
避免出现「已启用但没凭据」的灰色空行。

## 开发

```powershell
npm test         # vitest
npm run typecheck
npm run build
```

### 结构

| 文件 | 职责 |
|---|---|
| `src/paths.ts` | 路径解析（`configPath` 与插件同逻辑，见下） |
| `src/config-io.ts` | 读 / 原子写 / 深合并 |
| `src/providers.ts` | 每家需要哪些字段、值从哪拿（字段名由 `FieldKey` 类型约束） |
| `src/prompt.ts` | 掩码输入（逐字符 raw mode，明文不进 readline 回显） |
| `src/ui.ts` | 终端输出 + **按显示宽度**补齐 |
| `src/commands/*` | 四个命令 |
| `src/index.ts` | 参数解析与分发（无第三方依赖） |

### 与插件的一致性靠测试锁住

`configPath()` 和 `RawAppConfig` **没有 import 插件那两份**，而是本地副本 ——
因为跨包编译会让 `tsc` 的相对路径深度对不上（源码在 `src/`，产物在 `dist/`，
而插件在另一个目录，`rootDir` 只能取一个），CLI 必须能独立编译运行。

所以改用**对照测试**防漂移（`src/drift.test.ts`）：直接 import 插件的实现，断言

- `configPath()` 在不同 `APPDATA` 环境下两边结果相同
- `displayWidth()` 对同一批中英文字符两边结果相同
- CLI 列出的 provider id 插件都能识别

插件那边改了这些逻辑而 CLI 没跟上，测试立刻红。

### 踩过的坑

- **ESM 相对导入必须带 `.js` 后缀**。`tsc` 不会补，Node 的 ESM 解析器要求显式后缀，
  漏了就是运行时 `ERR_MODULE_NOT_FOUND`。
- **不能按「从本文件上溯固定层数」找仓库根**。源码在 `src/paths.ts`、产物在 `dist/paths.js`，
  两者深度差一层，写死层数必然在一种布局下算错。改成向上找含 `opencode-plugin/src/tui.tsx` 的祖先目录。
- **`String.padEnd` 不能用来对齐中英文混排**。它数 UTF-16 码元，`火山` 算 2 却占 4 列，
  `doctor` 的检查项列表会错开。用 `padDisplay()`（按显示宽度）。
- **`--json` 输出里不能混进 ANSI 转义**。详情文本保持纯净，着色留到打印时做。
- **`init --force` 曾整文件覆写**，把桌面程序的 `pet` / `lanMode` 清空。已改为只重置自己管的键 + 回归测试。

## 不做什么

- 不校验凭据是否真的能用（需要网络与各家 SDK）—— 那是插件启动后自己会报的事，`doctor` 只查配置完整性
- 不写回桌面程序的字段，不做 cookie 续期（那是桌面程序的职责）
