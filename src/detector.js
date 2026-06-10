/**
 * AI助手状态检测器
 * 支持: Claude Code (通过 statusLine JSON) 和 Kimi Code CLI (通过进程监控)
 */

const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// 状态枚举
const Status = {
  IDLE: 'idle',           // 空闲 - 等待用户输入
  EXECUTING: 'executing', // 执行中 - AI正在思考/生成/执行工具
  WAITING: 'waiting'      // 等待判断 - AI提出了建议，等待用户确认(y/n)
};

// Claude Code VS Code 扩展日志模式（CLI 没 statusLine 时的兜底识别）
// 注意：扩展日志格式不保证稳定，模式可能需要随扩展版本调整
const CLAUDE_LOG_PATTERNS = {
  // 工作中：API 请求/响应流/工具调用/思考
  executing: [
    /\b(sending (request|message|message to)|stream(ing)?\s+(response|chunk|message)|generating|thinking|tool[_ ]?use|running tool|executing (command|tool)|started request|in progress)/i,
    /\b(api[._-]?anthropic|claude[._-]?api)/i,
    /\b(querying|computing|processing (request|response))/i,
  ],
  // 等待用户决策：权限弹窗/确认提示
  waiting: [
    /\b(permission (required|needed|requested)|requires? (approval|confirmation|user (action|input)))/i,
    /\b(allow (this |the )?(action|tool|command)|\[y\/n\]|\(y\/n\)|yes\s*\/\s*no|approve|deny|confirm\?)/i,
    /\b(waiting for (user|input|response|confirmation|approval))/i,
  ],
};

// 日志状态判定超时（毫秒）
const LOG_TIMEOUTS = {
  executing: 5000,   // 5s 内无 executing 模式 → 不算 working
  waiting: 60000,    // 60s 内无 waiting 模式 → 不算 waiting
  noActivity: 10000, // 10s 内日志无新行 → 算 idle
};

const MAX_LOG_READ_PER_POLL = 1024 * 1024; // 单次轮询最多读 1MB，防止卡住

// Claude Code 项目 jsonl 扫描常量
const JSONL_TAIL_SIZE = 8 * 1024;           // 每次只读尾部 8KB
const MAX_JSONL_SIZE = 50 * 1024 * 1024;    // 超过 50MB 跳过（防御性）

class AIDetector {
  constructor() {
    this.assistants = new Map();
    this.callbacks = [];
    this.checkInterval = null;
    
    // 初始化支持的AI助手
    this.assistants.set('claude', {
      name: 'Claude Code',
      type: 'claude',
      status: Status.IDLE,
      lastUpdate: null,
      details: {},
      pid: null
    });

    // Claude Code VS Code 扩展日志扫描状态
    this.claudeLogState = {
      cachedLogPath: null,    // 缓存的日志文件路径
      cacheTime: 0,           // 缓存时间戳
      currentLogPath: null,   // 正在 tail 的文件
      lastReadPosition: 0,    // 已读取字节位置
      lastWaitingTime: 0,     // 最后一次匹配 waiting 模式的时间戳
      lastExecutingTime: 0,   // 最后一次匹配 executing 模式的时间戳
      lastAnyActivityTime: 0, // 最后读取到任何日志行的时间戳
      matchedSamples: [],     // 最近 3 条匹配样本（用于 hint 展示）
    };
  }

  // 注册状态变更回调
  onStatusChange(callback) {
    this.callbacks.push(callback);
  }

  // 通知所有回调
  notify(assistantId, status, details = {}) {
    const assistant = this.assistants.get(assistantId);
    if (assistant) {
      assistant.status = status;
      assistant.lastUpdate = new Date().toISOString();
      assistant.details = { ...assistant.details, ...details };
    }
    this.callbacks.forEach(cb => cb(assistantId, status, assistant));
  }

  // 启动监控
  start() {
    this.checkInterval = setInterval(() => this.checkAll(), 30000);
    this.checkAll(); // 立即检查一次
  }

  // 停止监控
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // 检查所有AI助手
  async checkAll() {
    await this.checkClaude();
  }

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

  // ==================== Claude Code VS Code 扩展日志检测 ====================

  /**
   * 返回 VS Code 的 logs 根目录（跨平台）
   * Windows: %APPDATA%\Code\logs
   * macOS:   ~/Library/Application Support/Code/logs
   * Linux:   $XDG_CONFIG_HOME/Code/logs 或 ~/.config/Code/logs
   */
  findVSCodeLogDir() {
    const platform = os.platform();
    if (platform === 'win32') {
      const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appdata, 'Code', 'logs');
    } else if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'logs');
    } else {
      const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      return path.join(xdg, 'Code', 'logs');
    }
  }

  /**
   * 找到 Claude Code 扩展最新 .log 文件
   * 路径: <logsRoot>/<sessionTimestamp>/<subdir>/exthost/Anthropic.claude-code/<file>.log
   * 其中 <subdir> 通常是 window<N>（一个 VS Code 实例可能开多个 window）
   * 30s 缓存以避免每 2s 都遍历目录
   */
  async findLatestClaudeCodeLog() {
    const state = this.claudeLogState;
    const now = Date.now();

    if (state.cachedLogPath && (now - state.cacheTime) < 30000) {
      try {
        const s = await fs.promises.stat(state.cachedLogPath);
        return { path: state.cachedLogPath, size: s.size, mtimeMs: s.mtimeMs };
      } catch (e) {
        state.cachedLogPath = null;
      }
    }

    const logsRoot = this.findVSCodeLogDir();
    if (!fs.existsSync(logsRoot)) return null;

    let sessions;
    try {
      sessions = await fs.promises.readdir(logsRoot, { withFileTypes: true });
    } catch (e) {
      return null;
    }

    // 找最新的 logs/<YYYYMMDDTHHMMSS>/ 目录
    const sessionDirs = sessions
      .filter(e => e.isDirectory() && /^\d{8}T\d{6}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();

    let newest = null;

    for (const session of sessionDirs) {
      const sessionPath = path.join(logsRoot, session);

      // 扫描 session 下所有子目录（window1, window2, ...），找 exthost/Anthropic.claude-code/
      let subEntries;
      try {
        subEntries = await fs.promises.readdir(sessionPath, { withFileTypes: true });
      } catch (e) {
        continue;
      }

      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        const extDir = path.join(sessionPath, sub.name, 'exthost', 'Anthropic.claude-code');
        if (!fs.existsSync(extDir)) continue;

        let files;
        try {
          files = await fs.promises.readdir(extDir);
        } catch (e) {
          continue;
        }

        for (const f of files) {
          if (!f.endsWith('.log')) continue;
          try {
            const fp = path.join(extDir, f);
            const s = await fs.promises.stat(fp);
            if (!newest || s.mtimeMs > newest.mtimeMs) {
              newest = { path: fp, size: s.size, mtimeMs: s.mtimeMs };
            }
          } catch (e) {
            // 跳过无权限/消失的文件
          }
        }
      }

      // 只看最近的一个 session（避免扫历史日志）
      if (newest) break;
    }

    if (newest) {
      state.cachedLogPath = newest.path;
      state.cacheTime = now;
    }

    return newest;
  }

  /**
   * 从 Claude Code 扩展日志中识别状态
   * - 增量 tail 同一文件（按字节位置）
   * - 文件被截断/轮转时重置
   * - waiting 模式优先于 executing
   * - 近期有任意活动但无模式匹配时也按 executing 处理（避免漏报）
   * @returns {{status: string, matchedLine: string|null, lastEventAt: number}|null}
   */
  async detectClaudeFromExtensionLog() {
    const logFile = await this.findLatestClaudeCodeLog();
    if (!logFile) return null;

    const state = this.claudeLogState;
    const now = Date.now();

    // 切换到新文件时重置
    if (state.currentLogPath !== logFile.path) {
      state.currentLogPath = logFile.path;
      state.lastReadPosition = 0;
      state.lastWaitingTime = 0;
      state.lastExecutingTime = 0;
      state.lastAnyActivityTime = 0;
      state.matchedSamples = [];
    }

    // 文件被截断/轮转
    let readFrom = state.lastReadPosition;
    if (logFile.size < state.lastReadPosition) {
      readFrom = 0;
    }

    if (logFile.size > readFrom) {
      const len = Math.min(logFile.size - readFrom, MAX_LOG_READ_PER_POLL);
      const fd = await fs.promises.open(logFile.path, 'r');
      let newContent = '';
      try {
        const buffer = Buffer.alloc(len);
        await fd.read(buffer, 0, len, readFrom);
        newContent = buffer.toString('utf8');
      } catch (e) {
        // 读取失败：保守做法是保持上一次的 lastReadPosition
        // 下次 poll 还能再试
      } finally {
        await fd.close();
      }
      state.lastReadPosition = readFrom + len;

      if (newContent) {
        const lines = newContent.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          state.lastAnyActivityTime = now;

          // waiting 优先
          let matchedKind = null;
          for (const pat of CLAUDE_LOG_PATTERNS.waiting) {
            if (pat.test(line)) { matchedKind = 'waiting'; break; }
          }
          if (!matchedKind) {
            for (const pat of CLAUDE_LOG_PATTERNS.executing) {
              if (pat.test(line)) { matchedKind = 'executing'; break; }
            }
          }
          if (matchedKind) {
            if (matchedKind === 'waiting') {
              state.lastWaitingTime = now;
            } else {
              state.lastExecutingTime = now;
            }
            if (state.matchedSamples.length >= 3) state.matchedSamples.shift();
            state.matchedSamples.push({ kind: matchedKind, line: line.slice(0, 200), at: now });
          }
        }
      }
    }

    // 综合判定
    const waitingRecent = state.lastWaitingTime > 0 && (now - state.lastWaitingTime) < LOG_TIMEOUTS.waiting;
    const executingRecent = state.lastExecutingTime > 0 && (now - state.lastExecutingTime) < LOG_TIMEOUTS.executing;
    const activityRecent = state.lastAnyActivityTime > 0 && (now - state.lastAnyActivityTime) < LOG_TIMEOUTS.noActivity;

    let status;
    if (waitingRecent) {
      status = Status.WAITING;
    } else if (executingRecent) {
      status = Status.EXECUTING;
    } else if (activityRecent) {
      status = Status.EXECUTING;
    } else {
      status = Status.IDLE;
    }

    const sample = state.matchedSamples.length > 0
      ? state.matchedSamples[state.matchedSamples.length - 1]
      : null;

    return {
      status,
      matchedLine: sample ? sample.line : null,
      lastEventAt: state.lastWaitingTime || state.lastExecutingTime || state.lastAnyActivityTime,
    };
  }

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

  // ==================== 通用工具方法 ====================

  // 查找进程 PID
  findProcess(processName) {
    return new Promise((resolve) => {
      const platform = os.platform();
      let cmd;
      
      if (platform === 'win32') {
        cmd = `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`;
      } else if (platform === 'darwin') {
        cmd = `pgrep -x "${processName}" || pgrep "${processName}"`;
      } else {
        cmd = `pgrep -x "${processName}" || pgrep -f "${processName}"`;
      }

      exec(cmd, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        if (platform === 'win32') {
          // Windows: 解析 CSV 输出
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
            if (parts[0] && parts[0].toLowerCase() === processName.toLowerCase()) {
              resolve(parseInt(parts[1], 10));
              return;
            }
          }
          resolve(null);
        } else {
          // macOS/Linux: pgrep 直接返回 PID
          const pid = parseInt(stdout.trim().split('\n')[0], 10);
          resolve(isNaN(pid) ? null : pid);
        }
      });
    });
  }

  // 获取所有助手状态
  getAllStatus() {
    const result = {};
    for (const [id, assistant] of this.assistants) {
      result[id] = { ...assistant };
    }
    return result;
  }

  // 获取单个助手状态
  getStatus(assistantId) {
    const assistant = this.assistants.get(assistantId);
    return assistant ? { ...assistant } : null;
  }

  // 手动设置状态（用于 VS Code 插件等无法自动检测的场景）
  setManualStatus(assistantId, status, details = {}) {
    const assistant = this.assistants.get(assistantId);
    if (!assistant) return false;
    
    assistant.status = status;
    assistant.lastUpdate = new Date().toISOString();
    assistant.details = { ...assistant.details, ...details, manual: true };
    
    this.callbacks.forEach(cb => cb(assistantId, status, assistant));
    return true;
  }

  // ==================== Windows 专用: 通过参数查找 Node 进程 ====================

  /**
   * Windows 上 npm 全局安装的 CLI 工具实际进程是 node.exe
   * 需要通过命令行参数来判断是否是目标 CLI
   * 使用 wmic 或 tasklist /v 获取命令行参数
   */
  findNodeProcessByArgs(keyword) {
    return new Promise((resolve) => {
      const platform = os.platform();
      if (platform !== 'win32') {
        resolve(null);
        return;
      }

      // 方法1: 使用 wmic (更可靠，能获取完整命令行)
      const wmicCmd = `wmic process where "name='node.exe'" get ProcessId,CommandLine /format:csv`;
      
      exec(wmicCmd, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          // wmic 失败，尝试方法2: tasklist /v
          this.findNodeProcessByTasklist(keyword).then(resolve);
          return;
        }

        try {
          const lines = stdout.trim().split('\n').filter(l => l.trim());
          // wmic CSV 格式: Node,CommandLine,ProcessId
          // 跳过标题行
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 3) {
              const commandLine = parts[1] || '';
              const pidStr = parts[parts.length - 1].trim();
              
              if (commandLine.toLowerCase().includes(keyword.toLowerCase())) {
                const pid = parseInt(pidStr, 10);
                if (!isNaN(pid)) {
                  resolve(pid);
                  return;
                }
              }
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  /**
   * 备选方法: 使用 tasklist /v 查找 node.exe 进程
   * 通过窗口标题或命令行参数判断
   */
  findNodeProcessByTasklist(keyword) {
    return new Promise((resolve) => {
      // tasklist /v 可以显示窗口标题，有时包含命令行信息
      const cmd = `tasklist /FI "IMAGENAME eq node.exe" /V /FO CSV /NH`;
      
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        try {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.split(',').map(p => p.replace(/"/g, '').trim());
            // CSV 格式: "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
            if (parts.length >= 9) {
              const windowTitle = parts[8] || '';
              const pidStr = parts[1];
              
              // 检查窗口标题是否包含关键词
              if (windowTitle.toLowerCase().includes(keyword.toLowerCase())) {
                const pid = parseInt(pidStr, 10);
                if (!isNaN(pid)) {
                  resolve(pid);
                  return;
                }
              }
            }
          }
          resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    });
  }
}

// 状态文件写入接口（供 Claude Code / Kimi 的 statusLine 脚本调用）
class StatusFileWriter {
  constructor() {
    this.baseDir = path.join(os.homedir(), '.ai-status-monitor');
    this.ensureDir();
  }

  ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  writeClaudeStatus(data) {
    const filePath = path.join(this.baseDir, 'claude-status.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  writeKimiStatus(data) {
    const filePath = path.join(this.baseDir, 'kimi-status.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}

module.exports = {
  AIDetector,
  StatusFileWriter,
  Status
};
