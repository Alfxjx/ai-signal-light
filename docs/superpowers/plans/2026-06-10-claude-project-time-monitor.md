# Claude Code 项目时间监控 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude Code 状态卡替换为"项目时间列表"——每行 = 一个 Claude Code 项目，右侧显示"距上次 AI 响应时间"。Kimi 卡完全隐藏。

**Architecture:** 后端每 30s 扫 `~/.claude/projects/`，对每个项目读所有 jsonl 的尾部 8KB 找最近 `type=assistant` 的 `timestamp`，原始数据通过 WebSocket 推给前端；前端做 7 天过滤和时间格式化，每 60s 重算"X 分钟前"。

**Tech Stack:** Electron, Node.js (fs.promises), 原生 HTML/CSS/JS（无框架、无测试套件、无打包器）

**Spec:** `docs/superpowers/specs/2026-06-10-claude-project-time-monitor-design.md`

---

## 任务清单概览

| # | 任务 | 文件 |
|---|------|------|
| 1 | 新增 `readJsonlTailTimestamp()` | `src/detector.js` |
| 2 | 新增 `extractProjectDisplayName()` | `src/detector.js` |
| 3 | 新增 `findJsonlFiles` + `scanClaudeProjects()` 聚合 | `src/detector.js` |
| 4 | 重构 `checkClaude()` 改用聚合 + 改 30s 间隔 | `src/detector.js` |
| 5 | 移除 Kimi 相关代码 | `src/detector.js` |
| 6 | 替换 Claude 卡片 + 删除 Kimi 卡片 | `src/renderer/index.html` |
| 7 | 新增 `renderProjects / formatAge / applyAgeColor` | `src/renderer/app.js` |
| 8 | 新增 60s 定时器更新相对时间 | `src/renderer/app.js` |
| 9 | 改 CSS：删旧状态类、加项目列表样式 | `src/renderer/style.css` |
| 10 | 更新 CLAUDE.md | `CLAUDE.md` |
| 11 | 手动端到端冒烟 | — |

---

## Task 1: 新增 `readJsonlTailTimestamp()`

**Files:**
- Modify: `src/detector.js:679-683`（在 `module.exports` 之前新增方法）

- [ ] **Step 1: 在 `AIDetector` 类内、`findProcess()` 之前新增常量与私有方法**

打开 `src/detector.js`，在第 42 行（`const MAX_LOG_READ_PER_POLL = 1024 * 1024;`）之后新增：

```js
// Claude Code 项目 jsonl 扫描常量
const JSONL_TAIL_SIZE = 8 * 1024;           // 每次只读尾部 8KB
const MAX_JSONL_SIZE = 50 * 1024 * 1024;    // 超过 50MB 跳过（防御性）
```

- [ ] **Step 2: 在 `findProcess` 之前（即 `detectClaudeFromExtensionLog` 之后、`// ==================== 通用工具方法` 之前）新增方法**

找到 `// ==================== 通用工具方法` 这一行，在它**之前**插入：

```js
  // ==================== Claude Code 项目扫描 ====================

  /**
   * 读 jsonl 尾部 8KB，反向扫描找最近一条 type=assistant && isSidechain!==true 的 timestamp
   * @param {string} jsonlPath
   * @returns {Promise<string|null>} ISO 字符串或 null
   */
  async readJsonlTailTimestamp(jsonlPath) {
    let stat;
    try {
      stat = await fs.promises.stat(jsonlPath);
    } catch (e) {
      return null;
    }
    if (stat.size === 0 || stat.size > MAX_JSONL_SIZE) return null;

    const start = Math.max(0, stat.size - JSONL_TAIL_SIZE);
    const length = stat.size - start;

    let fd = null;
    try {
      fd = await fs.promises.open(jsonlPath, 'r');
      const buffer = Buffer.alloc(length);
      await fd.read(buffer, 0, length, start);
      const text = buffer.toString('utf8');
      const lines = text.split('\n');
      // 丢弃最后一段（可能不完整）
      lines.pop();
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'assistant' && obj.isSidechain !== true && obj.timestamp) {
            return obj.timestamp;
          }
        } catch (e) {
          // 跳过坏行
        }
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      if (fd) {
        try { await fd.close(); } catch (e) {}
      }
    }
  }
```

- [ ] **Step 3: 冒烟测试**

跑：
```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && node -e "
const { AIDetector } = require('./src/detector.js');
const d = new AIDetector();
const path = require('path');
const os = require('os');
const p = path.join(os.homedir(), '.claude/projects/C--Users-cari-worspace-ng-pack-zipper/8fb8a511-9533-4c3b-92d3-69d9eed18be8.jsonl');
d.readJsonlTailTimestamp(p).then(ts => console.log('TS:', ts));
"
```

预期：打印 `TS: 2026-06-10T01:05:06.155Z` 之类的非空 ISO 字符串。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/detector.js && git commit -m "feat(detector): add readJsonlTailTimestamp helper"
```

---

## Task 2: 新增 `extractProjectDisplayName()`

**Files:**
- Modify: `src/detector.js`（紧接着 Task 1 的方法之后）

- [ ] **Step 1: 在 `readJsonlTailTimestamp` 之后插入新方法**

紧接 Task 1 新增的方法之后，插入：

```js
  /**
   * 从 jsonl 头部读前 8KB，找第一条含 cwd / slug 的记录，返回显示名来源
   * @param {string} jsonlPath
   * @returns {Promise<{name: string, source: 'cwd'|'slug'}|null>}
   */
  async extractProjectDisplayName(jsonlPath) {
    const HEAD_SIZE = 8 * 1024;
    let fd = null;
    try {
      const stat = await fs.promises.stat(jsonlPath);
      const length = Math.min(stat.size, HEAD_SIZE);
      fd = await fs.promises.open(jsonlPath, 'r');
      const buffer = Buffer.alloc(length);
      await fd.read(buffer, 0, length, 0);
      const text = buffer.toString('utf8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.cwd) {
            return { name: path.basename(obj.cwd), source: 'cwd' };
          }
          if (obj.slug) {
            return { name: obj.slug, source: 'slug' };
          }
        } catch (e) {
          // 跳过坏行
        }
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      if (fd) {
        try { await fd.close(); } catch (e) {}
      }
    }
  }
```

- [ ] **Step 2: 冒烟测试**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && node -e "
const { AIDetector } = require('./src/detector.js');
const d = new AIDetector();
const path = require('path');
const os = require('os');
const p = path.join(os.homedir(), '.claude/projects/C--Users-cari-worspace-ng-pack-zipper/8fb8a511-9533-4c3b-92d3-69d9eed18be8.jsonl');
d.extractProjectDisplayName(p).then(r => console.log('NAME:', r));
"
```

预期：`NAME: { name: 'pack-zipper', source: 'cwd' }`（基于你之前看到的 `cwd: 'C:\\Users\\cari\\worspace\\ng\\pack-zipper'`）。

- [ ] **Step 3: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/detector.js && git commit -m "feat(detector): add extractProjectDisplayName helper"
```

---

## Task 3: 新增 `findJsonlFiles` 递归 + `scanClaudeProjects()` 聚合

**Files:**
- Modify: `src/detector.js`（紧接着 Task 2 的方法之后）

- [ ] **Step 1: 在 `extractProjectDisplayName` 之后插入新方法**

先插入 `findJsonlFiles`：

```js
  /**
   * 递归收集目录下所有 .jsonl 文件
   * @param {string} dir
   * @returns {Promise<string[]>}
   */
  async findJsonlFiles(dir) {
    const results = [];
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
      return results;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await this.findJsonlFiles(full);
        results.push(...sub);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
    return results;
  }
```

再插入 `scanClaudeProjects`：

```js
  /**
   * 扫描 ~/.claude/projects/ 下所有项目，返回聚合结果
   * @returns {Promise<Array<{id: string, name: string, source: 'cwd'|'slug'|'id', lastResponse: string|null}>>}
   */
  async scanClaudeProjects() {
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

    let entries;
    try {
      entries = await fs.promises.readdir(projectsRoot, { withFileTypes: true });
    } catch (e) {
      console.warn('[claude] projects dir not accessible:', e.message);
      return [];
    }

    const results = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsRoot, entry.name);

      const jsonlFiles = await this.findJsonlFiles(projectPath);
      if (jsonlFiles.length === 0) continue;

      // 提取显示名：只从项目根 jsonl（不在 subagents/ 里）取
      let name = entry.name;
      let source = 'id';
      for (const f of jsonlFiles) {
        if (f.includes(`${path.sep}subagents${path.sep}`)) continue;
        const display = await this.extractProjectDisplayName(f);
        if (display) {
          name = display.name;
          source = display.source;
          break;
        }
      }

      // 找最近 assistant timestamp
      let lastResponse = null;
      for (const f of jsonlFiles) {
        const ts = await this.readJsonlTailTimestamp(f);
        if (ts && (!lastResponse || ts > lastResponse)) {
          lastResponse = ts;
        }
      }

      results.push({ id: entry.name, name, source, lastResponse });
    }

    return results;
  }
```

- [ ] **Step 2: 冒烟测试**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && node -e "
const { AIDetector } = require('./src/detector.js');
const d = new AIDetector();
d.scanClaudeProjects().then(rs => {
  console.log('count:', rs.length);
  console.log(JSON.stringify(rs.slice(0, 3), null, 2));
});
"
```

预期：输出 24 个项目（用户有 24 个），前 3 个的 JSON 包含 `id` / `name` / `source` / `lastResponse` 四个字段，`name` 是 cwd 末级（如 `pack-zipper`）。

- [ ] **Step 3: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/detector.js && git commit -m "feat(detector): add findJsonlFiles and scanClaudeProjects aggregator"
```

---

## Task 4: 重构 `checkClaude()` 改用聚合 + 改 30s 间隔

**Files:**
- Modify: `src/detector.js:98-101`（`start()` 改间隔）
- Modify: `src/detector.js:118-217`（`checkClaude()` 整个方法替换为薄包装）
- Modify: `src/detector.js:112-116`（`checkAll()` 移除 kimi 调用 —— 一并在 Task 6 改）

- [ ] **Step 1: 改 `start()` 间隔为 30000ms**

`src/detector.js:100`：

```js
    this.checkInterval = setInterval(() => this.checkAll(), 30000);
    this.checkAll(); // 立即检查一次
```

- [ ] **Step 2: 把 `checkClaude()`（第 118-217 行）整体替换为薄包装**

把第 118 行到第 217 行整段（`async checkClaude() {` 到 `}`）替换为：

```js
  // ==================== Claude Code 项目扫描 ====================

  async checkClaude() {
    try {
      const projects = await this.scanClaudeProjects();
      this.notify('claude', 'projects', {
        generatedAt: new Date().toISOString(),
        projects,
      });
    } catch (e) {
      console.warn('[claude] scan failed:', e.message);
    }
  }
```

- [ ] **Step 3: 冒烟测试（验证 notify 回调能拿到新结构）**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && node -e "
const { AIDetector } = require('./src/detector.js');
const d = new AIDetector();
d.onStatusChange((id, status, a) => {
  console.log('notify:', id, status, 'projects:', a.details.projects?.length);
  process.exit(0);
});
d.start();
setTimeout(() => process.exit(1), 5000);
"
```

预期：`notify: claude projects projects: 24`（或类似非零数字），然后退出。

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/detector.js && git commit -m "refactor(detector): rewire checkClaude to project scan, change poll to 30s"
```

---

## Task 5: 移除 Kimi 相关代码

**Files:**
- Modify: `src/detector.js:60-67`（删除 kimi 注册）
- Modify: `src/detector.js:112-116`（删除 checkAll 中的 kimi 调用）
- Modify: `src/detector.js:219-277`（删除整个 `checkKimi()` 方法）

- [ ] **Step 1: 删除 kimi 注册**

把第 60-67 行：
```js
    this.assistants.set('kimi', {
      name: 'Kimi Code CLI',
      type: 'kimi',
      status: Status.IDLE,
      lastUpdate: null,
      details: {},
      pid: null
    });
```
替换为空（直接删除这 9 行，保留上下文空行）。

- [ ] **Step 2: 简化 `checkAll()`**

把第 112-116 行：
```js
  async checkAll() {
    await this.checkClaude();
    await this.checkKimi();
  }
```
替换为：
```js
  async checkAll() {
    await this.checkClaude();
  }
```

- [ ] **Step 3: 删除 `checkKimi()` 方法**

删除第 219 行到第 277 行（从 `// ==================== Kimi Code CLI 检测 ====================` 注释开始，到 `checkKimi` 结束的 `}`）。

注意：第 218 行的 `// ==================== Claude Code VS Code 扩展日志检测 ====================` 之前应该有 `findVSCodeLogDir` 等。要确认删除范围：
- **起点**：`// ==================== Kimi Code CLI 检测 ====================`（包括这行）
- **终点**：紧接 `this.notify('kimi', status, details);` 后的 `}` 的下一行之前

更稳妥的方式：删之前先 `Read` 一下确认第 218-225 行是什么内容。

- [ ] **Step 4: 验证 detector 仍能加载**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && node -e "
const d = require('./src/detector.js');
console.log('exports:', Object.keys(d));
const det = new d.AIDetector();
console.log('assistants:', [...det.assistants.keys()]);
det.checkClaude().then(() => console.log('OK'));
"
```

预期：
```
exports: [ 'AIDetector', 'StatusFileWriter', 'Status' ]
assistants: [ 'claude' ]
OK
```

- [ ] **Step 5: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/detector.js && git commit -m "feat(detector): scan claude code project jsonls for last assistant response; drop kimi"
```

如果项目没初始化 git，先 `git init` + `git add -A` + `git commit -m "initial"`，再走 commit。

---

## Task 6: 替换 Claude 卡片 + 删除 Kimi 卡片

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: 先读现状**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && cat src/renderer/index.html
```

确认 `.status-card[data-assistant="kimi"]` 和 `.status-card[data-assistant="claude"]` 的当前结构。

- [ ] **Step 2: 整段替换两个卡片的内容**

定位到 `<div class="status-card" data-assistant="kimi">` 这一行（包含它的 `</div>` 闭合），把整段（含标题"手动切换"等）**完全删除**。

定位到 `<div class="status-card" data-assistant="claude">` 这一段，把**整个卡片**替换为：

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

- [ ] **Step 3: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/renderer/index.html && git commit -m "feat(renderer): replace claude card with project list; remove kimi card"
```

---

## Task 7: 新增 `renderProjects / formatAge / applyAgeColor`

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: 先读现状**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && cat src/renderer/app.js
```

找到 `updateCard()` 和 `StatusMonitor` 类的位置。

- [ ] **Step 2: 在 `StatusMonitor` 类内、消息分发前新增方法**

定位到 `class StatusMonitor` 块内部，在 `updateCard()` 之后（或替换 `updateCard` 之前的位置）插入：

```js
  formatAge(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 0) return '刚刚';
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  applyAgeColor(el, ts) {
    el.classList.remove('age-fresh', 'age-warn', 'age-stale');
    if (!ts) { el.classList.add('age-stale'); return; }
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 5 * 60 * 1000) el.classList.add('age-fresh');
    else if (diff < 60 * 60 * 1000) el.classList.add('age-warn');
    else el.classList.add('age-stale');
  }

  renderProjects(projects, rangeMs) {
    const list = document.getElementById('claudeProjectList');
    if (!list) return;
    const now = Date.now();
    const filtered = (projects || [])
      .filter(p => p.lastResponse)
      .filter(p => rangeMs === 0 || (now - new Date(p.lastResponse).getTime()) <= rangeMs)
      .sort((a, b) => new Date(b.lastResponse) - new Date(a.lastResponse));

    if (filtered.length === 0) {
      list.innerHTML = '<li class="project-empty">暂无项目</li>';
      return;
    }

    list.innerHTML = filtered.map(p => {
      const ts = p.lastResponse;
      return `<li class="project-row">
        <span class="project-name" title="${p.id}">${p.name}</span>
        <span class="project-time" data-ts="${ts}">${this.formatAge(ts)}</span>
      </li>`;
    }).join('');

    // 应用颜色
    list.querySelectorAll('.project-time').forEach(el => {
      this.applyAgeColor(el, el.dataset.ts);
    });
  }

  updateAllProjectTimes() {
    const list = document.getElementById('claudeProjectList');
    if (!list) return;
    list.querySelectorAll('.project-time').forEach(el => {
      el.textContent = this.formatAge(el.dataset.ts);
      this.applyAgeColor(el, el.dataset.ts);
    });
  }
```

- [ ] **Step 3: 改写消息分发里的 `updateCard` 调用为 `renderProjects`**

定位到 `updateCard` 被调用的位置（很可能是 WS 消息处理里），把：

```js
this.updateCard('claude', data.claude);
```

替换为：

```js
if (data.claude && data.claude.details) {
  const rangeSelect = document.getElementById('claudeRange');
  const rangeMs = rangeSelect ? parseInt(rangeSelect.value, 10) : 604800000;
  this.renderProjects(data.claude.details.projects, rangeMs);
}
```

- [ ] **Step 4: 旧 `updateCard` 方法体替换为兼容桩（避免残留报错）**

把整个 `updateCard(assistantId, info)` 方法**整段替换**为：

```js
  updateCard(assistantId, info) {
    // 已废弃：项目列表走 renderProjects()
    // 保留此方法仅为兼容外部调用
  }
```

- [ ] **Step 5: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/renderer/app.js && git commit -m "feat(renderer): add renderProjects, formatAge, applyAgeColor methods"
```

---

## Task 8: 新增 60s 定时器更新相对时间

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: 找到 `StatusMonitor` 构造或 `init` 方法**

读 `app.js` 找到类的构造函数（`constructor`）或 `init/connect/connectWS` 之类的方法。

- [ ] **Step 2: 在 WS 连接成功后启动定时器**

在 WS `onopen` 或 `connect()` 内启动定时器（确保只启动一次）：

```js
if (!this._ageTimer) {
  this._ageTimer = setInterval(() => this.updateAllProjectTimes(), 60000);
}
```

- [ ] **Step 3: 给 `claudeRange` 绑定 change 事件**

在 `StatusMonitor` 类的合适位置（如 `constructor` 末尾）新增：

```js
const rangeSelect = document.getElementById('claudeRange');
if (rangeSelect) {
  rangeSelect.addEventListener('change', () => {
    if (this._lastProjects) {
      this.renderProjects(this._lastProjects, parseInt(rangeSelect.value, 10));
    }
  });
}
```

并在 `renderProjects` 开头加一行缓存：

```js
this._lastProjects = projects || [];
```

- [ ] **Step 4: 冒烟测试（手动加载 renderer）**

启动应用：
```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && npm start
```

打开 DevTools 确认：
- 项目列表显示
- 切换 select 立刻过滤
- 等 1 分钟观察时间从 "X 秒前" 跳到 "X 分钟前"（如果等待过长可以临时把 interval 改成 5s 自测）

- [ ] **Step 5: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/renderer/app.js && git commit -m "feat(renderer): project list rendering with 7d/30d/all filter and 60s time refresh"
```

---

## Task 9: 改 CSS

**Files:**
- Modify: `src/renderer/style.css`

- [ ] **Step 1: 先读现状确认旧状态类**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && cat src/renderer/style.css
```

定位 `.status-idle` `.status-executing` `.status-waiting` 规则。

- [ ] **Step 2: 删除旧状态类规则**

删除以下三类（如果存在）：
- `.status-idle { ... }`
- `.status-executing { ... }`
- `.status-waiting { ... }`

如果某条规则被多个选择器共享（如 `.status-card.status-idle`），只删除 claude/kimi 状态相关部分，保留卡片基础样式。

- [ ] **Step 3: 追加新规则**

在文件末尾追加：

```css
/* Claude Code 项目列表 */
.claude-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.claude-title {
  font-weight: 500;
}

.claude-range {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: inherit;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
}

.project-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
}

.project-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.project-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.project-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

.project-time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.age-fresh { color: #4ade80; }
.age-warn  { color: #facc15; }
.age-stale { color: #94a3b8; }

.project-empty {
  padding: 8px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
}
```

- [ ] **Step 4: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add src/renderer/style.css && git commit -m "style(renderer): project list layout, remove old status classes"
```

---

## Task 10: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新"Architecture"章节的检测说明**

把 `src/detector.js` 描述改为：

```markdown
├── detector.js      # AIDetector: scanClaudeProjects() 每 30s 扫 ~/.claude/projects/,
│                    # 对每个项目读所有 jsonl 尾部 8KB 找最近 type=assistant 的 timestamp,
│                    # 原始数据通过 WebSocket 推给前端，前端做过滤与时间格式化。
│                    # 不再做 idle/executing/waiting 状态判断。Kimi 已停用。
```

- [ ] **Step 2: 更新"State Model"章节**

把整节替换为：

```markdown
## State Model

Claude Code 项目监控的"状态"= 距上次 assistant 响应的时间差。在前端做颜色染色（`<5min` 绿 / `<1h` 黄 / 其他灰）。

不再使用 `Status` 枚举中的 IDLE/EXECUTING/WAITING；它们保留在代码里仅作历史兼容。
```

- [ ] **Step 3: 更新"Detection Strategy"表格**

把整个表格替换为：

```markdown
## Detection Strategy

| Assistant | 数据源 | 读策略 | 轮询 |
|---|---|---|---|
| Claude Code CLI | `~/.claude/projects/<project>/*.jsonl`（主+子代理） | 尾部 8KB 反向扫最近 `type=assistant && isSidechain!==true` 的 timestamp | 30s |
| Kimi Code CLI | — | 已停用 | — |

项目显示名优先级：`cwd` 末级 > `slug` > 项目目录名。
```

- [ ] **Step 4: 更新"Adding a New AI Assistant"章节（标注已废弃）**

把整节替换为：

```markdown
## 已废弃：Adding a New AI Assistant

本项目当前只监控 Claude Code，不再支持通用助手添加流程。如需恢复 Kimi 或新增助手，需重新设计状态模型。
```

- [ ] **Step 5: 提交**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git add CLAUDE.md && git commit -m "docs: update architecture for claude code project time monitor"
```

---

## Task 11: 手动端到端冒烟

**Files:** 无

- [ ] **Step 1: 启动应用**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && npm start
```

- [ ] **Step 2: 验证清单**

跑过以下 7 项才算 OK：

- [ ] 面板只剩一张 Claude Code 卡片，标题为"Claude Code 项目"，右侧有 24h/7d/30d/全部 select
- [ ] 卡片下显示 24 个项目（取决于 `~/.claude/projects/` 实际数量）
- [ ] 项目名是 cwd 末级（如 `pack-zipper`），鼠标悬停显示完整目录名
- [ ] 右侧时间从绿/黄/灰三种颜色之一
- [ ] 切换 select 到 24h：超过 24 小时没响应的项目消失
- [ ] 在某个 Claude Code 项目里发一条新消息，30s 内该项目时间跳回"刚刚"
- [ ] 关闭 Claude Code：项目仍显示"X 分钟前"（设计预期）

- [ ] **Step 3: 暂存所有剩余改动**

```bash
cd "C:/Users/cari/Documents/kimi/Workspaces/ai-signal-light" && git status
```

如果有未提交的改动：
```bash
git add -A
git commit -m "chore: post-smoke leftovers"
```

---

## 自审（spec → task 覆盖）

- 数据源约定（spec §数据源约定）：Task 1 (`readJsonlTailTimestamp`) + Task 3 (`findJsonlFiles` + `scanClaudeProjects`) ✓
- 跳过 `isSidechain: true`：Task 1 ✓
- 30s 间隔：Task 4 ✓
- 移除 Kimi：Task 5 ✓
- WebSocket payload 结构：Task 4 输出的 `details.projects` 数组 + Task 7 渲染该结构 ✓
- index.html 新结构：Task 6 ✓
- 前端 7 天过滤在前端做：Task 8 (`claudeRange` change 事件 + `rangeMs` 过滤) ✓
- 60s 定时器只更新 text 不重建 DOM：Task 7 (`updateAllProjectTimes`) + Task 8 启动定时器 ✓
- 错误处理 5 行：Task 1/2/3 try-catch 覆盖、Task 4 顶层 try-catch、`MAX_JSONL_SIZE` 常量 ✓
- 测试：人工冒烟 Task 11 ✓
- 文件改动清单：Task 1-10 全部对应 ✓

无占位符、无"待补充"、无"类似 Task N"。
