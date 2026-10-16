# asl-cli

AI状态监控 的命令行版：输出 6 家供应商（Kimi / MiniMax / 火山 / DeepSeek / MiMo / Codex）的用量配额，支持结构化 JSON、终端表格和 `--watch` 常驻刷新。

## 安装

```powershell
cd asl-cli
npm install          # providers-core 以 file: 依赖装入（需先在 ../providers-core 跑过 npm install && npm run build）
npm run build
npm link             # 可选：全局注册 asl 命令
```

## 命令

| 命令 | 行为 |
|------|------|
| `asl` / `asl usage` | 渲染所有已启用 provider 的表格，渲染完退出 |
| `asl usage --json` | stdout 出结构化 JSON（无颜色，管道/脚本友好） |
| `asl usage -p <id>` | 只看一家（`kimi\|minimax\|volcengine\|deepseek\|mimo\|codex`，可组合 --json） |
| `asl usage --watch` | 常驻，默认 60s 原地刷新（ANSI 清屏重绘），Ctrl+C 退出 |
| `asl usage --watch-interval <秒>` | 刷新间隔（最小 5，默认 60） |
| `asl config` | doctor：显示 config.json 实际路径 + 各家 enabled / 凭据状态 |

## 配置来源

只读桌面端（AI状态监控）正式版 config.json：`%APPDATA%\AI状态监控\config.json`。各家 token / AK·SK / 阈值（warn、danger）全部以桌面端设置页保存的为准，本 CLI 不写任何配置；Codex 凭据自动读 `~/.codex/auth.json`（过期自动刷新写回）。

## JSON 输出 shape

```json
{
  "configPath": "C:\\Users\\cari\\AppData\\Roaming\\AI状态监控\\config.json",
  "fetchedAt": "2026-10-16T12:00:00.000Z",
  "providers": [
    {
      "id": "kimi",
      "name": "Kimi",
      "windows": [{ "label": "5h", "percent": 52, "resetTime": "2026-10-16T15:00:00.000Z" }],
      "balance": null,
      "error": null,
      "lastUpdated": "2026-10-16T12:00:00.000Z"
    }
  ]
}
```

`percent` 一律是「已用 %」（越接近 100 越危险）；`windows` 与 `balance` 二者只居其一；`error` 非空时该行灰显（`no_token` 显示「未配置」）。

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功（允许部分 provider 失败） |
| 1 | config.json 缺失/解析失败，或 `-p` 指定了未启用的 provider |
| 2 | 全部已启用 provider 取数失败 |

## 开发

```powershell
npm test          # vitest（render / json / doctor / fetchState 纯函数）
npm run typecheck
npm run build
```

底层取数逻辑在共享包 `../providers-core`（与 opencode-plugin 同源）；改取数要先去那边改并重新 build，本包只负责参数解析、渲染与 watch。
