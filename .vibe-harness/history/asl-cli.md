# asl-cli — AI状态监控 命令行版（用量配额）

- 时间：2026-10-16
- 分支：`cli-dev`（基于 main 创建）
- 设计：[plans/asl-cli.md](../plans/asl-cli.md)

## 实际改动

### 新增 `providers-core/`（共享取数核心，private，CJS dist）

- `src/{types,config,format}.ts` + `src/providers/*.ts`：自 `opencode-plugin/src/` **复制**迁移（原包不动），含全部 12 个测试文件（87 个测试）原样通过——证明搬迁零行为变化
- 新增 `src/index.ts` 顶层出口（`export *` 自 types/config/format/providers/index）
- 编译为 **CommonJS**（`module: commonjs`）：迁移来的源码是 extensionless 相对导入，ESM/NodeNext 下跑不起来；`declaration: true` 供下游 ESM 消费
- `npm run build` 产出 `dist/`；`main`/`types` 指向 dist

### 新增 `asl-cli/`（CLI 壳，private，ESM）

- `package.json`：`bin: { asl: ./dist/index.js }`；依赖 `providers-core`（`file:../providers-core`）、chalk ^5、commander ^12
- `src/collect.ts`：`collectStates()` = loadConfig → enabledProviders → 并发 `fetchState`（单家失败写 `error` 字段不抛异常，模式对齐 tui.tsx 的 fetchOne）；`CollectResult` 含 configPath/configError/thresholds/states
- `src/json.ts`：`buildJson(configPath, states, error?, fetchedAt?)` → `{ configPath, fetchedAt, error?, providers }`
- `src/render.ts`：`renderUsage(states, opts)` 纯函数；手写进度条（█/░，16 格）；阈值着色（<warn 绿 / warn~danger 黄 / ≥danger 红，阈值读 config）；错误行灰显（no_token→「未配置」）；`color:false` 输出纯文本（测试用）
- `src/doctor.ts`：`providerStatuses`（token 型看 config 字段、火山看 AK+SK、Codex 看 `~/.codex/auth.json` 存在性）+ `renderDoctor`
- `src/watch.ts`：ANSI 清屏原地重绘循环，SIGINT 退出
- `src/index.ts`：commander 入口；`usage` 子命令（--json / -p / --watch / --watch-interval）+ `config` 子命令 + 无子命令默认 usage；退出码 0 成功 / 1 config 缺失或 -p 未启用 / 2 全部失败
- 源码相对导入必须带 `.js` 扩展名（NodeNext ESM）

## 坑

1. **file: 依赖顺序**：asl-cli 安装前 providers-core 必须先 `npm run build`，否则 node_modules 里没有 dist
2. **pwsh 管道测 JSON 会误报**：本 shell 环境用 OEM 代码页解码 node 的 UTF-8 stdout，`\\` 被搅成乱码导致 `ConvertFrom-Json` 报「Bad JSON escape sequence」——JSON 本身合法，验证要走文件（`> temp.json` 再 node 解析），真实终端无碍
3. **chalk 在 vitest 里 level=0**：非 tty 自动降级，着色断言前要手动 `chalk.level = 3`
4. **opencode-plugin 迁移（另开任务）**：opencode 从磁盘加载 TS 源码，能否 import 包外 `file:` 依赖未知，需先实测其加载器；不行退化为 sync 脚本

## 影响范围

- 新增：`providers-core/**`、`asl-cli/**`（两包均 private 不发布）
- 不动：`opencode-plugin/`（仍持有一份旧拷贝）、桌面端、安卓
- 文档：`AGENTS.md`（sibling projects + Commands 表）、`asl-cli/README.md`、`.vibe-harness/{plans,index,history}`

## 验证

- `providers-core`：87 测试全绿 + tsc 构建通过
- `asl-cli`：11 测试全绿 + build 通过
- 手动：默认表格（真实数据 5 家）、`--json`（node JSON.parse 校验）、`-p kimi`、`config` doctor、config 缺失路径（stderr + exit 1，--json 带 error 字段）、`-p nope`（exit 1）、`--watch --watch-interval 5`（渲染 + 持续重绘 + Stop-Process 杀掉）
