/**
 * AI助手状态检测器
 * 支持: Claude Code (通过 jsonl 文件扫描)
 * Kimi Code CLI 已停用
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import type { ClaudeProject, DetectorDetails, AssistantStatus, DetectorAllStatus } from '../shared/types/detector';

/**
 * @deprecated 保留仅作历史兼容，不再使用 IDLE/EXECUTING/WAITING 状态模型
 */
export enum Status {
  IDLE = 'idle',
  EXECUTING = 'executing',
  WAITING = 'waiting',
}

// Claude Code 项目 jsonl 扫描常量
const JSONL_TAIL_SIZE = 8 * 1024;           // 每次只读尾部 8KB
const MAX_JSONL_SIZE = 50 * 1024 * 1024;    // 超过 50MB 跳过（防御性）

interface AssistantEntry {
  name: string;
  type: string;
  status: Status | 'projects';
  lastUpdate: string | null;
  details: Record<string, unknown>;
  pid: number | null;
}

type StatusChangeCallback = (assistantId: string, status: string, assistant: AssistantEntry) => void;

export class AIDetector {
  private assistants = new Map<string, AssistantEntry>();
  private callbacks: StatusChangeCallback[] = [];
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 初始化支持的AI助手
    this.assistants.set('claude', {
      name: 'Claude Code',
      type: 'claude',
      status: Status.IDLE,
      lastUpdate: null,
      details: {},
      pid: null
    });
  }

  // 注册状态变更回调
  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  // 通知所有回调
  private notify(assistantId: string, status: string, details: Record<string, unknown> = {}): void {
    const assistant = this.assistants.get(assistantId);
    if (assistant) {
      assistant.status = status as Status | 'projects';
      assistant.lastUpdate = new Date().toISOString();
      assistant.details = { ...assistant.details, ...details };
    }
    this.callbacks.forEach(cb => cb(assistantId, status, assistant!));
  }

  // 启动监控
  start(): void {
    this.checkInterval = setInterval(() => this.checkAll(), 30000);
    this.checkAll(); // 立即检查一次
  }

  // 停止监控
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // 检查所有AI助手
  async checkAll(): Promise<void> {
    await this.checkClaude();
  }

  // ==================== Claude Code 项目扫描 ====================

  private async checkClaude(): Promise<void> {
    try {
      const projects = await this.scanClaudeProjects();
      this.notify('claude', 'projects', {
        generatedAt: new Date().toISOString(),
        projects,
      });
    } catch (e) {
      console.warn('[claude] scan failed:', (e as Error).message);
    }
  }

  /**
   * 读 jsonl 尾部 8KB，反向扫描找最近一条 type=assistant && isSidechain!==true 的 timestamp
   */
  private async readJsonlTailTimestamp(jsonlPath: string): Promise<string | null> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(jsonlPath);
    } catch {
      return null;
    }
    if (stat.size === 0 || stat.size > MAX_JSONL_SIZE) return null;

    const start = Math.max(0, stat.size - JSONL_TAIL_SIZE);
    const length = stat.size - start;

    let fd: fs.promises.FileHandle | null = null;
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
          const obj = JSON.parse(line) as Record<string, unknown>;
          if (obj.type === 'assistant' && obj.isSidechain !== true && obj.timestamp) {
            return String(obj.timestamp);
          }
        } catch {
          // 跳过坏行
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      if (fd) {
        try { await fd.close(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * 从 jsonl 头部读前 8KB，找第一条含 cwd / slug 的记录，返回显示名来源
   */
  private async extractProjectDisplayName(jsonlPath: string): Promise<{ name: string; source: 'cwd' | 'slug'; cwd: string | null } | null> {
    const HEAD_SIZE = 8 * 1024;
    let fd: fs.promises.FileHandle | null = null;
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
          const obj = JSON.parse(line) as Record<string, unknown>;
          if (obj.cwd && typeof obj.cwd === 'string') {
            return { name: path.basename(obj.cwd), source: 'cwd', cwd: obj.cwd };
          }
          if (obj.slug && typeof obj.slug === 'string') {
            return { name: obj.slug, source: 'slug', cwd: null };
          }
        } catch {
          // 跳过坏行
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      if (fd) {
        try { await fd.close(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * 递归收集目录下所有 .jsonl 文件
   */
  private async findJsonlFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
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
   */
  async scanClaudeProjects(): Promise<ClaudeProject[]> {
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects');

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(projectsRoot, { withFileTypes: true });
    } catch (e) {
      console.warn('[claude] projects dir not accessible:', (e as Error).message);
      return [];
    }

    const results: ClaudeProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsRoot, entry.name);

      const jsonlFiles = await this.findJsonlFiles(projectPath);
      if (jsonlFiles.length === 0) continue;

      // 提取显示名：只从项目根 jsonl（不在 subagents/ 里）取
      let name = entry.name;
      let source: 'cwd' | 'slug' | 'id' = 'id';
      let cwd: string | null = null;
      for (const f of jsonlFiles) {
        if (f.includes(`${path.sep}subagents${path.sep}`)) continue;
        const display = await this.extractProjectDisplayName(f);
        if (display) {
          name = display.name;
          source = display.source;
          cwd = display.cwd;
          break;
        }
      }

      // 找最近 assistant timestamp
      let lastResponse: string | null = null;
      for (const f of jsonlFiles) {
        const ts = await this.readJsonlTailTimestamp(f);
        if (ts && (!lastResponse || ts > lastResponse)) {
          lastResponse = ts;
        }
      }

      results.push({ id: entry.name, name, source, cwd, lastResponse });
    }

    return results;
  }

  // 获取所有助手状态
  getAllStatus(): DetectorAllStatus {
    const result: DetectorAllStatus = {};
    for (const [id, assistant] of this.assistants) {
      result[id] = { ...assistant } as unknown as AssistantStatus;
    }
    return result;
  }

  // 获取单个助手状态
  getStatus(assistantId: string): AssistantStatus | null {
    const assistant = this.assistants.get(assistantId);
    return assistant ? { ...assistant } as unknown as AssistantStatus : null;
  }

  // 手动设置状态（用于 VS Code 插件等无法自动检测的场景）
  setManualStatus(assistantId: string, status: string, details: Record<string, unknown> = {}): boolean {
    const assistant = this.assistants.get(assistantId);
    if (!assistant) return false;

    assistant.status = status as Status | 'projects';
    assistant.lastUpdate = new Date().toISOString();
    assistant.details = { ...assistant.details, ...details, manual: true };

    this.callbacks.forEach(cb => cb(assistantId, status, assistant));
    return true;
  }
}
