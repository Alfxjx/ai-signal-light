# opencode-usage-plugin-helper-cli 实施计划

- 时间：2026-09-29
- 目标：给 `opencode-plugin` 配一个 CLI 助手，让**没装桌面程序**的 opencode 用户也能自助完成插件配置
- 目录：项目根新建 `opencode-usage-plugin-helper-cli/`

## 背景

现状：插件只读 `%APPDATA%\AI状态监控\config.json`，这个文件由桌面程序生成。
没装桌面程序的用户面对三道坎：

1. 不知道这个文件存在、也不知道路径
2. 不知道每家需要什么字段、值从哪个控制台拿
3. 不知道 opencode 的插件转发文件要手动创建（`cli.json` 的 `plugins` 不生效）
   以及 `npm install --legacy-peer-deps` 是**运行时**前提

## 范围（用户确认：doctor / init+set / install）

**不做** `check`（实测凭据，需网络与 provider 源码）、**不做** `providers`（列配置项，doctor 会带出缺失字段）。

因此本 CLI：**零网络、零第三方依赖**（只用 Node 内置 + readline），
不需要 `@opencode/plugin` / `solid-js`，也不用和插件共享运行时。

## 关键设计：路径单一来源

**直接 import 插件的 `configPath()`**，CLI 不自己重写一遍路径解析。

理由：`opencode-plugin/src/config.ts:49-53` 已有跨平台兜底
（`APPDATA` 为空时回退 `homedir()/AppData/Roaming`），
所以在 macOS/Linux 上 CLI 写 `~/AppData/Roaming/AI状态监控/config.json`，
插件读到的就是同一个文件 —— **插件本身一行都不用改**。

风险：跨包相对 import。用 CLI 的 tsconfig `include` 覆盖 `../opencode-plugin/src/config.ts` 解决。
若将来插件那边改路径逻辑，CLI 自动跟随，不会漂移。

## 命令

| 命令 | 作用 |
|---|---|
| `init` | 在 `configPath()` 生成 config.json 骨架（五家全 `enabled: false` + `thresholds`）。已存在则拒绝，除非 `--force` |
| `set <provider>` | 交互式（掩码输入）或 `--token/--field value` 写入某家凭据，写完自动 `enabled: true` |
| `doctor` | 体检：config 路径 / 文件存在性与 JSON 合法性 / 每家缺什么字段 / 转发文件在不在 / `node_modules` 在不在 / opencode 版本。给可执行的下一步 |
| `install` | 生成 `~/.config/opencode/plugins/usage-sidebar/tui.ts` 转发文件，路径按 stub 位置算**相对路径**；已存在则备份 |

## 目录结构

```
opencode-usage-plugin-helper-cli/
├── package.json          # bin: usage-helper，type: module
├── tsconfig.json         # include 本目录 + ../opencode-plugin/src/config.ts
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts          # 命令分发 + 参数解析（无依赖，手写 parse）
    ├── paths.ts          # configPath（re-export）/ pluginDir / stubPath / 相对路径
    ├── config-io.ts      # 读 + 原子写 + 保留未知字段
    ├── providers.ts      # 每家需要哪些字段、从哪拿
    ├── prompt.ts         # 掩码输入（readline + 静音输出）
    ├── commands/
    │   ├── init.ts
    │   ├── set.ts
    │   ├── doctor.ts
    │   └── install.ts
    └── *.test.ts         # 纯函数部分单测
```

## 关键正确性要求

1. **原子写**：先写 `<file>.tmp` 再 `rename`，避免和桌面程序并发时读到半个文件
2. **保留未知字段**：config.json 里有 `window` / `pet` / `floatingBall` / `lanMode` 等
   桌面程序专属字段。CLI 只深合并自己管的 provider 节点，**绝不整文件覆写**，
   否则会把桌面程序的窗口位置、宠物设置全清空
3. **类型对齐**：从插件 import `RawAppConfig` 类型，保证写出的形状插件一定读得懂
4. **不打印明文凭据**：`doctor` 只显示「已配置 / 缺失」，不显示 token 内容

## 测试范围

只测纯函数（不 spawn CLI、不碰真实路径）：

- `config-io`：原子写不留 tmp、深合并保留未知字段、JSON 损坏时报错不崩
- `paths`：相对路径计算（含 Windows 分隔符、跨盘符退化）
- `providers`：每家必需字段的元数据自洽
- 掩码输入：不测（需要 TTY）

## 落地步骤

1. `package.json` / `tsconfig.json` / `vitest.config.ts` 骨架
2. `paths.ts`（含 re-export configPath）
3. `config-io.ts`（原子写 + 深合并）→ 先写测试
4. `providers.ts` 元数据
5. `prompt.ts` 掩码输入
6. 四个命令
7. `index.ts` 分发
8. `README.md`（含「没装桌面程序怎么用」的完整流程）
9. `npm test` + `npm run typecheck`
10. 在本机实跑 `doctor` / `init --force` 验证（注意：会动真实 config.json，用 `--force` 且先备份）

## 风险

- **`set` 会改真实 config.json**：本机验证时先备份，且只改一个 provider 的字段
- 跨包 import 在 `tsc` 下能过，但若 CLI 要发布成 npm 包会断依赖 —— 本期只在仓库内用，不发布
