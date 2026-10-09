# opencode 供应商用量侧边栏插件

## 改动摘要

新增独立 npm 包 `opencode-plugin/`（与 `landing/`、`android-app/` 平级，不参与根
`tsconfig.json` / `vite.config.ts` / 根 vitest），在 opencode TUI 的 `sidebar.content`
插槽渲染 Kimi / MiniMax / 火山 Coding Plan / DeepSeek / MiMo 五家用量。

- **凭据只读** `%APPDATA%\AI状态监控\config.json`（正式版 userData），绝不写回；
  cookie / CSRF 续期回写由桌面应用独占。不读 `-dev`，不支持环境变量覆盖。
- **取数**：五家各自 `fetch`（8s 超时、浏览器 UA），映射逻辑从 `src/main/usage-monitor.ts`
  与 `src/main/volcengine-sign.ts` 移植成纯函数版本，共享同一批单测 fixture 与火山官方 V4 测试向量。
- **刷新**：`setup` 立即拉一轮 → 每 5 分钟轮询（与 config 的 `intervalMinutes` 解耦）+
  失败指数退避（上限 30 分钟）+ 单飞 promise；`/usage`、命令面板、`Ctrl+Alt+U` 共用同一轮。
- **缓存**：结果落 `context.storage.store('snapshot', …)`，重启后理论上先渲染缓存再后台刷新
  （见「验证结果」——这一条未验证）。
- **UI 最终形态（2026-09-28 评审改版）**：不做进度条（原设计的 5 格 `█░` 条形已去掉）；
  每家多行展开 —— 配额型 = 1 行标题（按最紧窗口着色）+ 每周期 1 行「  标签  百分比  倒计时」，
  余额型 = 单行「名称  金额」。百分比一律是「已用 %」（MiniMax = `100 - remaining`）。

### 加载方式（唯一有效路径）

opencode 的**全局插件发现目录**，本机为
`C:\Users\cari\.config\opencode\plugins\usage-sidebar\tui.ts`，内容一行 re-export：

```ts
export { default } from '../../../../Documents/kimi/Workspaces/ai-signal-light/opencode-plugin/src/tui.tsx';
```

- 仓库外、不受版本控制，换机器要手动重建。
- **不要**写进 `cli.json` 的 `plugins`（实测无效，见下）。
- 运行时依赖来自仓库内 `opencode-plugin/node_modules`（Bun 从 stub import 的文件向上解析
  `@opencode/plugin/tui` 与 `solid-js`），所以 `npm install` 是运行时前提，不只是开发前提。

## 关键坑（footgun）

- **`cli.json` 本地路径条目零日志静默忽略**。三种写法都失败：`"file:///C:/…"`、裸绝对路径
  `"C:/…"`、以及给包补 `"."` 主入口（`exports` 同时含 `"."` 与 `"./tui"`）后重试。
  判定方法：`setup()` 里临时 `appendFileSync` 一行看文件是否出现，或查
  `~/.local/share/opencode/log/opencode.log` 的 `plugin operation failed` / reconciliation 行。
- **`Context` 不是 `@opencode/plugin/tui` 的顶层导出**，只有 `Plugin.Context`。写
  `import type { Context }` 会报 TS2305；靠 `Plugin.define` 的上下文推断拿类型。
- **`context.keymap.layer()` 必须由组件调用**：放进 `setup()` 会报 `Keymap.Provider is missing`，
  且 `setup` 抛异常会让此前注册的 `sidebar.content` 插槽一起失效 → **侧边栏整块空白**。
  修法：命令注册放进 `append: 'app'` 的插槽 render，注销函数加进 cleanup。
- **`npm install` 必须加 `--legacy-peer-deps`**，否则 `@opencode/theme` + `@opentui/*` ERESOLVE。
- **MiniMax 返回的是「剩余 %」**，展示的已用 % = `100 - remaining`；Kimi / 火山 `percent`
  本身就是已用 %。
- **火山鉴权失败常返回 HTTP 200 + 响应体 `ResponseMetadata.Error`**，必须同时看 body 错误码。
- **火山 AK/SK 通道缺档要抛错回退 cookie**，不要展示 0。

## 影响范围

- 新增：`opencode-plugin/**`（独立包，含 `README.md`、13 个源文件 + 8 个测试文件）。
- 修改：`.gitignore` 追加 `/opencode-plugin/node_modules`。
- 文档：`docs/superpowers/specs/2026-09-28-opencode-usage-sidebar-design.md` 同步（去 `model.ts`、
  加载方式改为全局发现目录、风险表第 1 行更新）；`.vibe-harness/` 本文件与 plan/index。
- **桌面应用代码零改动**：`src/`、根 `package.json` / `tsconfig.json` / `vite.config.ts` 均未动。
- 仓库外：`~/.config/opencode/plugins/usage-sidebar/tui.ts` stub（不受版本控制）。

## 验证结果

- `npm test`（插件目录内）：**77 passed**，全绿。
- `npm run typecheck`：**0 错误**。
- **E2E 已确认（2026-09-28）**：
  - 五家真实数据渲染成功 —— Kimi 5h/周、MiniMax 5h/周、火山 5h/周/月、DeepSeek ¥29.06、MiMo ¥33.06。
  - `/usage` 与 `Ctrl+Alt+U` 都能触发刷新并弹汇总 toast。
  - config 路径不存在时插件不崩（按计划用 `loadConfig('C:\\__ai_signal_light_missing__\\config.json')`
    安全手法验证，日志无 `plugin operation failed`）。
  - `enabled` 过滤由 `src/providers/index.test.ts` 单测覆盖，未做 E2E。
- **未验证**：「重启后先显示缓存再刷新」—— 用户主动跳过。若日后确认未持久化，
  `context.storage.store` 的落盘位置需再查（`~/.local/state/opencode/kv.json` 是 TUI 自己的设置，
  不是插件存储；疑似在 `opencode.db`）。
