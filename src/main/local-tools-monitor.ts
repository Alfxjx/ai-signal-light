/**
 * 本地 Agent 工具运行状态监控（Codex/ChatGPT 客户端 · MiniMax Code · opencode）。
 *
 * 数据源（全部只读本机，已实测验证）：
 * - codex：~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl（CLI 与 ChatGPT 桌面版共用），
 *   首行 session_meta.payload.cwd 为工作目录，末条记录 timestamp 为最后活跃；
 *   进程匹配 codex.exe / ChatGPT.exe。
 * - mcode (MiniMax Code)：~/.minimax-code/.mcode-active/<pid>.json 为 mcode 自写的运行标记
 *   （注意有残留风险，须配 pid 存活检测）；~/.minimax/v2/sessions 下会话文件 mtime 为最后活跃。
 * - opencode：~/.local/state/opencode/service.json 提供 { pid, version, url }；
 *   ~/.local/share/opencode 最新文件 mtime 为最后活跃。
 *
 * 状态判定：running 且最近活跃 ≤ 60s → working；running → idle；否则 offline。
 * 聚合优先级：任一 working > 任一 idle > 全 offline。
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import type {
  LocalToolId,
  LocalToolStatus,
  LocalToolsStatus,
  LocalToolState,
} from '../shared/types/local-tools';

/** 最近活跃窗口：running 且最后活跃 ≤ 60s 视为工作中 */
const ACTIVE_WINDOW_MS = 60_000;
/** 默认轮询间隔 */
const POLL_INTERVAL_MS = 10_000;
/** 读 codex jsonl 头/尾的字节数。
 * 注意：Codex 的 session_meta 首行含 base_instructions 等大字段，8KB 会截断首行
 * 导致 cwd 解析失败，故取 256KB（10s 一次轮询，IO 可忽略）。 */
const JSONL_SNIP = 256 * 1024;

// ==================== 纯函数（便于单测） ====================

/** process.kill(pid, 0) 探测进程存活（EPERM 表示进程存在但无权限） */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 解析 mcode 活跃标记：目录下最新的 *.json（{ pid, startedAtMs }）。
 * 无标记 / 坏 json / pid 缺失 → null。
 */
export function readActiveMarker(dir: string): { pid: number; startedAtMs: number } | null {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let bestPath: string | null = null;
  let bestMtime = -1;
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const full = path.join(dir, n);
    try {
      const st = fs.statSync(full);
      if (st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        bestPath = full;
      }
    } catch {
      // 忽略坏文件
    }
  }
  if (!bestPath) return null;
  try {
    const v = JSON.parse(fs.readFileSync(bestPath, 'utf8')) as { pid?: unknown; startedAtMs?: unknown };
    if (typeof v.pid !== 'number') return null;
    return { pid: v.pid, startedAtMs: typeof v.startedAtMs === 'number' ? v.startedAtMs : Date.now() };
  } catch {
    return null;
  }
}

/** 解析 opencode service.json（{ pid, version, url }）；缺文件 / pid 非数字 → null */
export function readOpenCodeService(file: string): { pid: number; version: string | null; url: string | null } | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: unknown; version?: unknown; url?: unknown };
    if (typeof v.pid !== 'number') return null;
    return {
      pid: v.pid,
      version: typeof v.version === 'string' ? v.version : null,
      url: typeof v.url === 'string' ? v.url : null,
    };
  } catch {
    return null;
  }
}

/**
 * 解析 codex session jsonl：头部找 session_meta.payload.cwd，尾部倒扫最后一条 timestamp。
 * 文件不可读 / 空 → null。
 */
export async function parseCodexSession(
  jsonlPath: string,
): Promise<{ cwd: string | null; lastTsMs: number | null } | null> {
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(jsonlPath);
  } catch {
    return null;
  }
  if (st.size === 0) return null;

  const readChunk = async (start: number, length: number): Promise<string> => {
    let fd: fs.promises.FileHandle | null = null;
    try {
      fd = await fs.promises.open(jsonlPath, 'r');
      const buf = Buffer.alloc(length);
      await fd.read(buf, 0, length, start);
      return buf.toString('utf8');
    } catch {
      return '';
    } finally {
      if (fd) {
        try { await fd.close(); } catch { /* ignore */ }
      }
    }
  };

  // 头部找 cwd
  let cwd: string | null = null;
  const head = await readChunk(0, Math.min(st.size, JSONL_SNIP));
  for (const line of head.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as { type?: string; payload?: { cwd?: unknown } };
      if (obj.type === 'session_meta' && typeof obj.payload?.cwd === 'string') {
        cwd = obj.payload.cwd;
        break;
      }
    } catch {
      // 跳过坏行
    }
  }

  // 尾部倒扫最后一条带 timestamp 的记录
  let lastTsMs: number | null = null;
  const start = Math.max(0, st.size - JSONL_SNIP);
  const tail = await readChunk(start, st.size - start);
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { timestamp?: unknown };
      if (typeof obj.timestamp === 'string') {
        const m = Date.parse(obj.timestamp);
        if (!Number.isNaN(m)) {
          lastTsMs = m;
          break;
        }
      }
    } catch {
      // 跳过坏行 / 截断行
    }
  }

  return { cwd, lastTsMs };
}

/**
 * 递归找目录下最新的文件（可按扩展名过滤，带深度/数量防御）。
 */
export async function findLatestFile(
  root: string,
  opts: { ext?: string[]; maxDepth?: number; maxFiles?: number } = {},
): Promise<{ path: string; mtimeMs: number } | null> {
  const maxDepth = opts.maxDepth ?? 6;
  const maxFiles = opts.maxFiles ?? 2000;
  let best: { path: string; mtimeMs: number } | null = null;
  let count = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (++count > maxFiles) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, depth + 1);
      } else if (e.isFile()) {
        if (opts.ext && !opts.ext.includes(path.extname(e.name).toLowerCase())) continue;
        let st: fs.Stats;
        try {
          st = await fs.promises.stat(full);
        } catch {
          continue;
        }
        if (!best || st.mtimeMs > best.mtimeMs) best = { path: full, mtimeMs: st.mtimeMs };
      }
    }
  }

  await walk(root, 0);
  return best;
}

/** 判断进程名列表是否命中任一目标名（大小写不敏感，子串匹配） */
export function matchProcessNames(lines: string[], names: string[]): boolean {
  if (lines.length === 0 || names.length === 0) return false;
  const lowerLines = lines.map((l) => l.toLowerCase());
  return names.some((n) => lowerLines.some((l) => l.includes(n.toLowerCase())));
}

/** 判断 codex cwd 来源：ChatGPT 桌面版项目目录（Documents/Codex/...）vs CLI 用户目录 */
export function classifyCodexCwd(cwd: string | null): 'desktop' | 'cli' | null {
  if (!cwd) return null;
  const low = cwd.toLowerCase();
  if (low.includes('\\documents\\codex\\') || low.includes('/documents/codex/')) return 'desktop';
  return 'cli';
}

/** 聚合多个工具状态：任一 working > 任一 idle > 全 offline */
export function aggregateToolState(tools: Record<LocalToolId, LocalToolStatus>): LocalToolState {
  let result: LocalToolState = 'offline';
  for (const t of Object.values(tools)) {
    if (t.state === 'working') return 'working';
    if (t.state === 'idle') result = 'idle';
  }
  return result;
}

/** 组装单个工具状态：running 且最近活跃 ≤ 窗口 → working；running → idle；否则 offline */
export function buildToolStatus(
  running: boolean,
  lastActive: number | null,
  now: number,
  activeWindowMs: number,
  extra: { cwd?: string | null; detail?: string | null } = {},
): LocalToolStatus {
  let state: LocalToolState = 'offline';
  if (running) state = lastActive != null && now - lastActive <= activeWindowMs ? 'working' : 'idle';
  return { running, state, cwd: extra.cwd ?? null, lastActive, detail: extra.detail ?? null };
}

// ==================== 平台层 ====================

function execFileAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

/** 抓取本机进程名列表（Windows tasklist CSV / 其他 ps）。失败返回空数组。 */
export async function listProcesses(): Promise<string[]> {
  try {
    if (process.platform === 'win32') {
      const out = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH']);
      return out.split(/\r?\n/).filter(Boolean);
    }
    const out = await execFileAsync('ps', ['-ax', '-o', 'comm=']);
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readTextFile(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// ==================== 监控器 ====================

export type LocalToolsStatusCallback = (status: LocalToolsStatus) => void;

export interface LocalToolsMonitorOptions {
  /** 最近活跃窗口 ms（测试注入） */
  activeWindowMs?: number;
  /** 轮询间隔 ms（测试注入） */
  pollIntervalMs?: number;
  /** 用户主目录（测试注入） */
  homeDir?: string;
  /** 进程列表获取（测试注入） */
  listProcesses?: () => Promise<string[]>;
}

export class LocalToolsMonitor {
  private onChangeCb: LocalToolsStatusCallback | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private lastKey = '';
  private latest: LocalToolsStatus | null = null;

  constructor(private opts: LocalToolsMonitorOptions = {}) {}

  onStatusChange(cb: LocalToolsStatusCallback): void {
    this.onChangeCb = cb;
  }

  /** 最近一次采集结果；未采集过为 null */
  getStatus(): LocalToolsStatus | null {
    return this.latest;
  }

  /** 手动刷新（托盘/面板 refresh 事件） */
  refresh(): void {
    void this.pollOnce();
  }

  start(): void {
    if (this.stopped) return;
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.opts.pollIntervalMs ?? POLL_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 每轮采集 + 推送，仅在实质变化时广播（避免 10s 无谓刷新） */
  private async pollOnce(): Promise<void> {
    try {
      const status = await this.collect();
      this.latest = status;
      const key = JSON.stringify(status);
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.onChangeCb?.(status);
      }
    } catch (e) {
      console.warn('[local-tools] collect failed:', (e as Error).message);
    }
  }

  private async collect(): Promise<LocalToolsStatus> {
    const now = Date.now();
    const home = this.opts.homeDir ?? os.homedir();
    const activeWindowMs = this.opts.activeWindowMs ?? ACTIVE_WINDOW_MS;

    const procs = await (this.opts.listProcesses ?? listProcesses)();
    const codexRunning = matchProcessNames(procs, ['codex.exe', 'chatgpt.exe']);

    const tools: Record<LocalToolId, LocalToolStatus> = {
      codex: await this.collectCodex(home, codexRunning, now, activeWindowMs),
      mcode: await this.collectMcode(home, now, activeWindowMs),
      opencode: await this.collectOpenCode(home, now, activeWindowMs),
    };

    return {
      available: this.sourcesExist(home),
      state: aggregateToolState(tools),
      tools,
      lastUpdate: now,
    };
  }

  /** 任一数据源存在（装过工具）即可显示卡片 */
  private sourcesExist(home: string): boolean {
    return (
      fs.existsSync(path.join(home, '.codex', 'sessions')) ||
      fs.existsSync(path.join(home, '.minimax-code', '.mcode-active')) ||
      fs.existsSync(path.join(home, '.local', 'state', 'opencode', 'service.json'))
    );
  }

  private async collectCodex(
    home: string,
    running: boolean,
    now: number,
    activeWindowMs: number,
  ): Promise<LocalToolStatus> {
    const latest = await findLatestFile(path.join(home, '.codex', 'sessions'), { ext: ['.jsonl'] });
    let cwd: string | null = null;
    let lastActive: number | null = null;
    if (latest) {
      const meta = await parseCodexSession(latest.path);
      cwd = meta?.cwd ?? null;
      lastActive = meta?.lastTsMs ?? latest.mtimeMs;
    }
    const detail = classifyCodexCwd(cwd) === 'desktop' ? 'ChatGPT 桌面客户端' : cwd ? 'Codex CLI' : null;
    return buildToolStatus(running, lastActive, now, activeWindowMs, { cwd, detail });
  }

  private async collectMcode(
    home: string,
    now: number,
    activeWindowMs: number,
  ): Promise<LocalToolStatus> {
    const active = readActiveMarker(path.join(home, '.minimax-code', '.mcode-active'));
    const running = active ? isPidAlive(active.pid) : false;

    const latest = await findLatestFile(path.join(home, '.minimax', 'v2', 'sessions'), {
      ext: ['.jsonl', '.json'],
    });
    let lastActive = latest?.mtimeMs ?? null;
    if (active && (lastActive == null || active.startedAtMs > lastActive)) {
      lastActive = active.startedAtMs;
    }
    const version = readTextFile(path.join(home, '.minimax-code', 'current'))?.trim() ?? null;
    return buildToolStatus(running, lastActive, now, activeWindowMs, {
      detail: version ? `v${version}` : null,
    });
  }

  private async collectOpenCode(
    home: string,
    now: number,
    activeWindowMs: number,
  ): Promise<LocalToolStatus> {
    const service = readOpenCodeService(path.join(home, '.local', 'state', 'opencode', 'service.json'));
    const running = service ? isPidAlive(service.pid) : false;

    const latest = await findLatestFile(path.join(home, '.local', 'share', 'opencode'), {
      ext: ['.db', '.json', '.jsonl'],
    });
    const lastActive = latest?.mtimeMs ?? null;

    const url = service?.url?.replace(/^https?:\/\//, '') ?? null;
    const detail = service
      ? [url, service.version ? `v${service.version}` : null].filter(Boolean).join(' · ')
      : null;
    return buildToolStatus(running, lastActive, now, activeWindowMs, { detail });
  }
}
