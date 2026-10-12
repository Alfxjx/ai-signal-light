# opencode-codex-provider

- 时间：2026-10-12
- 范围：opencode 用量侧边栏插件新增第 6 家 provider：Codex
- 关联：`opencode-plugin/src/{types,config}.ts`、`opencode-plugin/src/providers/{codex.ts,codex.test.ts,index.ts,index.test.ts}`、`opencode-plugin/README.md`、`AGENTS.md`
- 改动摘要：
  - `providers/codex.ts`：移植桌面端 `src/main/codex-credentials.ts`（读 `~/.codex/auth.json`、JWT exp 判断、过期走 auth.openai.com refresh_token 刷新并 tmp+rename 原子写回）+ `usage-monitor.ts` 的 `fetchCodex` / `mapWhamUsage`（wham/usage 的 primary→5h、secondary→周，reset_at 秒级时间戳转 ISO）
  - Codex 无 config.json token，本地未登录 Codex CLI 时抛 `no_token` → 渲染「未配置」
  - `ProviderId` 加 `'codex'`，`RawAppConfig` 加 `codex` 字段（只用 enabled 开关），注册表追加第 6 家
  - README 更新：六家列表、写入例外说明（auth.json）、对应关系表加 codex 行、已知限制删掉 Codex；AGENTS.md 同步「不含任何写入逻辑」的过时描述
- 影响范围：仅 opencode-plugin 包；桌面端、CLI 助手无改动。插件因此新增一个写文件行为（仅 `~/.codex/auth.json`，与 CLI/桌面同一约定）
- 验证：`npx tsc --noEmit` 通过；`npm test` 12 文件 121 用例全过（新增 codex.test.ts 9 例：decodeExp/parseCodexAuthFile/isCodexTokenValid/mapWhamUsage）；另跑过一次**真实拉取**（临时 live 测试，已删）：读到本机 auth.json，wham/usage 返回 5h=3%，secondary 窗口为 null 时正确过滤
- 已知限制：插件的 httpRequest 不支持代理，chatgpt.com 在国内无系统代理时会持续网络错误（已在 README 已知限制中注明）
