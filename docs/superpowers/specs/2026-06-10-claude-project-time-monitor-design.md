# Claude Code 项目时间监控 — 设计文档

- 日期：2026-06-10
- 状态：已批准（待用户审阅 spec）
- 范围：替换原 Claude Code 卡 + 隐藏 Kimi 卡，Kimi 检测逻辑移除

## 背景

当前 `ai-assistant-status-monitor` 检测 Claude Code 状态的链路是：

1. `~/.ai-status-monitor/claude-status.json` 由 statusLine 脚本（`scripts/status-reporter.js --claude-stdin`）写入
2. `src/detector.js` 的 `checkClaude()` 读取该 JSON 文件判断 idle/executing/waiting

该链路有两个问题（已在前几轮对话定位）：

- 脚本只把 Claude Code 原生 statusLine JSON 原样落盘 + 加一个 `lastActivity`，但 detector 期望 `isGenerating` / `isThinking` / `pendingToolUses`，**字段名不匹配**。detector 总是落到 `lastActivity < 5s` 分支，因此一直显示"执行中"。
- 用户实际有 24 个 Claude Code 项目分布在 `~/.claude/projects/<project>/*.jsonl` 里，每个 jsonl 的最后一条 `type=assistant` 记录带 `timestamp`，**这才是"AI 是否还在响应"的最直接证据**。

## 目标

把"状态机判断"换成"项目时间监控"：

- 每 30s 扫一次 `~/.claude/projects/` 下所有项目目录
- 对每个项目，从其所有 jsonl 的尾部 8KB 找最近的 `type=assistant` 时间戳
- 在面板上以"项目列表"形式展示"距上次响应时间"
- 移除 Kimi 卡片；Kimi 检测不再触发

## 非目标（YAGNI）

- 不做 idle/executing/waiting 状态判断
- 不做点击项目跳转到 `cwd` 的交互
- 不区分主会话与子代理（项目级聚合，子代理 `isSidechain: true` 跳过）
- 不恢复 Kimi（卡片移除，检测代码移除，但 `StatusFileWriter` 保留以便未来重启）
- 不写跨平台路径测试（依赖 `os.homedir()`，与现状一致）
- 不改 `Status` 枚举（保留 IDLE/EXECUTING/WAITING 三个值，但运行时不再被使用）

## 数据源约定

### 项目目录

根：`~/.claude/projects/`（用 `path.join(os.homedir(), '.claude', 'projects')` 拼，跨平台）

每个一级子目录 = 一个项目。例：

```
C--Users-cari-worspace-ng-pack-zipper
D--codes-moco-KJ95XDashboard
...
```

### jsonl 范围

- 项目根下的 `*.jsonl`（主会话）
- 项目根下任意深度子目录中的 `*.jsonl`（含 `subagents/agent-*.jsonl`）
- 不区分主从，但**只看 `isSidechain !== true` 的 assistant 记录**（子代理的 assistant 记录在主线另一处也会出现，不重复计）

### 单 jsonl 读取策略

只读尾部 8KB：

1. `fs.promises.open(path, 'r')`
2. `fs.stat(path).size` 拿总大小；若 `size <= 8KB`，从 0 开始读
3. `fd.read(buffer, 0, 8KB, max(0, size - 8KB))`
4. 把 buffer 转 utf8，按 `\n` 切
5. **丢弃最后一段**（可能不是完整 JSON 行）
6. 从后往前逐行 `JSON.parse`，跳过 `JSON.parse` 抛错的行
7. 第一个匹配 `type === "assistant" && isSidechain !== true` 的行，记下 `timestamp`

> 8KB ≈ 5~30 条记录，对单条 1~3KB 的 JSON 消息足够覆盖最近一段会话。

## 架构

### 后端 (`src/detector.js`)

- 删除 `this.assistants.set('kimi', ...)`
- 删除 `checkKimi()` 方法
- `checkAll()` 改为只调用 `checkClaude()`，但 `checkClaude()` 内部不再做旧的状态判定，改为调用 `scanClaudeProjects()`，每 30s 一次（替换原 2s 间隔）
- 新增 `scanClaudeProjects()` 私有方法
- 新增 `readJsonlTailTimestamp(path)` 私有方法
- 新增 `extractProjectDisplayName(jsonlPath)` 私有方法
- `this.assistants.get('claude')` 的 `status` 字段含义改为固定 `'projects'`（不再在 IDLE/EXECUTING/WAITING 间切换）
- `getStatus('claude')` 返回结构扩展 `details.projects: [...]`

### WebSocket payload (`src/server.js`)

`/api/status` 推送的消息结构：

```js
{
  type: 'init' | 'statusChange',
  data: {
    claude: {
      status: 'projects',
      lastUpdate: '<ISO>',
      details: {
        generatedAt: '<ISO>',
        projects: [
          {
            id: 'C--Users-cari-worspace-ng-pack-zipper',
            name: 'pack-zipper',           // 来自 cwd 末级，缺失时回退到 slug，再回退到 id
            lastResponse: '<ISO>' | null,  // null = 没有任何 assistant 记录
            source: 'cwd' | 'slug' | 'id',
          }
        ]
      }
    }
    // 不再有 kimi 键
  }
}
```

### 前端 (`src/renderer/`)

#### `index.html`

- 删除 `data-assistant="kimi"` 卡片
- 删除 `data-assistant="claude"` 卡片内的状态色块、`.btn-manual` 区
- 替换为：

```html
<div class="status-card" data-assistant="claude">
  <div class="claude-header">
    <span class="claude-title">Claude Code 项目</span>
    <select id="claudeRange" class="claude-range">
      <option value="86400000">24h</option>
      <option value="604800000" selected>7d</option>
      <option value="2592000000">30d</option>
      <option value="0">全部</option>
    </select>
  </div>
  <ul id="claudeProjectList" class="project-list"></ul>
</div>
```

#### `app.js`

- 删除 `updateCard()` 中针对 idle/executing/waiting 的状态色切换与按钮 `.active` 同步逻辑
- 新增 `renderProjects(projects, rangeMs)`：
  - 过滤 `lastResponse === null` 的（从未响应的项目，不展示）
  - 过滤 `now - new Date(lastResponse) > rangeMs` 的（`rangeMs > 0` 时）
  - 按 `lastResponse` 倒序
  - 生成 `<li class="project-row">`：
    - `<span class="project-name">pack-zipper</span>`
    - `<span class="project-time" data-ts="<ISO>">刚刚</span>`
- 新增 `formatAge(ts)`：`<60s` → "刚刚"；`<60m` → "X 分钟前"；`<24h` → "X 小时前"；否则 `MM-DD HH:mm`
- 新增 `applyAgeColor(el, ts)`：`<5min` 加 `.age-fresh`；`<1h` 加 `.age-warn`；否则 `.age-stale`
- 每 60s 跑一次 `setInterval(updateAllProjectTimes, 60000)`，只更新已有 `<li>` 的 text + class，不重建 DOM
- `range` 切换：只触发 `renderProjects(...)`，**不重新拉数据**

#### `style.css`

- 新增 `.project-list`：`max-height: 360px; overflow-y: auto;` + 紧凑 padding
- 新增 `.project-row`：`display: flex; justify-content: space-between; align-items: center; padding: 4px 8px;`
- 新增 `.claude-header`：`display: flex; justify-content: space-between;`
- 新增 `.age-fresh` `.age-warn` `.age-stale` 颜色（绿 `#4ade80` / 黄 `#facc15` / 灰 `#94a3b8`）
- 删除 `.status-idle` `.status-executing` `.status-waiting` 规则（如确认无其他引用）

## 错误处理

| 场景 | 行为 |
|---|---|
| `~/.claude/projects/` 不存在或无权限 | `scanClaudeProjects()` 返回空列表 + `console.warn`，UI 显示"暂无项目"占位 |
| 单个 jsonl 解析失败 | 跳过该文件，不影响其他项目；不写错误日志（避免 30s 一次的噪声） |
| 尾部 8KB 不是完整行 | 丢弃最后一段，从倒数第二段开始解析 |
| jsonl >50MB | 跳过（防御性上限，可调常量 `MAX_JSONL_SIZE = 50 * 1024 * 1024`） |
| 扫描未在 30s 内完成 | 串行 `for...of`，不并发；超时由下一轮覆盖 |

## 性能

- 24 项目 × 平均 2 jsonl = 48 文件 × 8KB = ~400KB 读 / 30s
- ~13KB/s 持续 IO，可忽略
- 解析 48 个 8KB 缓冲 = 几百次 JSON.parse，亚毫秒级
- 现状 2s `exec tasklist` + `wmic` 调用更慢，新方案在 IO 和 CPU 上都更省

## 测试

由于项目无测试套件（`CLAUDE.md` 已说明），本设计**不引入测试框架**。人工验证步骤：

1. 启动应用，观察面板有"Claude Code 项目"标题 + 24h/7d/30d/全部 选择器
2. 项目列表应显示有过 assistant 响应的项目，按最近响应倒序
3. 选择 24h 范围：超过 24 小时没响应的项目消失
4. 等待 1 分钟：相对时间自动从"X 秒前"跳到"X 分钟前"
5. 在某 Claude Code 项目里发一条新消息：30s 内该项目的 lastResponse 应更新，时间跳回"刚刚"
6. 关闭 Claude Code：项目仍显示"X 分钟前"——这是设计预期，不算 bug（jsonl 还在）
7. 检查 `~/.claude/projects/` 不存在时的兜底

## 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/detector.js` | 删除 kimi 注册与 checkKimi；checkClaude 改为 scanClaudeProjects；新增 3 个私有方法；调整 start() 间隔为 30000 |
| `src/server.js` | 不变（它只是转发 detector 输出） |
| `src/renderer/index.html` | 删除 kimi 卡；重写 claude 卡 |
| `src/renderer/app.js` | 删除 updateCard 状态逻辑；新增 renderProjects/formatAge/applyAgeColor；新增 60s 定时器 |
| `src/renderer/style.css` | 删除旧状态类；新增 project-list/project-row/age-* 规则 |
| `scripts/status-reporter.js` | **不动**（脚本本身合规，问题在前几轮已分析） |
| `scripts/claude-status.sh/.ps1` | **不动**（用户已不依赖 statusLine 链路） |
| `CLAUDE.md` | 同步更新架构描述（手动） |

## 后续可做（不在本 spec）

- 状态判断（idle/executing/waiting）的恢复：基于 lastResponse 与 now 的时间差做阈值染色
- Kimi 卡片恢复
- 子代理单独成行
- 跳转到 `cwd` 的快捷入口
