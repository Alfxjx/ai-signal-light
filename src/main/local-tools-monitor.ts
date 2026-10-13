/**
 * 本地 Agent 工具运行状态监控（Codex/ChatGPT 客户端 · MiniMax Code · opencode）。
 *
 * 数据源（全部只读本机，已实测验证）：
 * - codex：~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl（CLI 与 ChatGPT 桌面版共用），
 *   首行 session_meta.payload.cwd 为工作目录，末条事件推断当前忙态（reasoning=思考 /
 *   function_call·message.assistant=编辑 / task_complete·token_count=空闲）；
 *   进程匹配 codex.exe / ChatGPT.exe。
 * - mcode (MiniMax Code)：~/.minimax-code/.mcode-active/<pid>.json 为 mcode 自写的运行标记
 *   （有残留风险，须配 pid 存活检测）；权威状态在 ~/.minimax/v2/sqlite/runtime-state.sqlite
 *   （status/title/workspace_dir/updated_at_ms）——Electron 28 内置 Node 18 无 node:sqlite，
 *   故 spawn 外部 node（v22.5+ 才有 node:sqlite）查询，失败降级会话文件 mtime。
 * - opencode：~/.local/state/opencode/service.json 提供 { pid, version, url, password }；
 *   HTTP API（Basic auth，用户名 opencode，密码即 password）GET /api/session 拿当前会话的
 *   location.directory（工作目录）、title（含状态前缀 thinking/idle）、time.updated/idle。
 *
 * 状态判定：running 且 phase=thinking/editing → working；idle → idle；否则 offline。
 * 聚合优先级：任一 working > 任一 idle > 全 offline。
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import type {
  LocalToolId,
  LocalToolPhase,
  LocalToolStatus,
  LocalToolsStatus,
  LocalToolState,
} from '../shared/types/local-tools';

/** 最近活跃窗口：running 且最后活跃 ≤ 60s 视为工作中 */
const ACTIVE_WINDOW_MS = 60_000;
/** 默认轮询间隔 */
const POLL_INTERVAL_MS = 10_000;
/** 读 codex jsonl 头/尾的字节数（session_meta 首行含 base_instructions 大字段，8KB 会截断） */
const JSONL_SNIP = 256 * 1024;
/** opencode HTTP API 超时 */
const API_TIMEOUT_MS = 2_000;
/** spawn 外部 node 读 mcode sqlite 超时（node 冷启动 + 读 3.6MB db 需数秒） */
const SQLITE_TIMEOUT_MS = 8_000;

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

/** 解析 opencode service.json（{ pid, version, url, password }）；缺文件 / pid 非数字 → null */
export function readOpenCodeService(
  file: string,
): { pid: number; version: string | null; url: string | null; password: string | null } | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      pid?: unknown;
      version?: unknown;
      url?: unknown;
      password?: unknown;
    };
    if (typeof v.pid !== 'number') return null;
    return {
      pid: v.pid,
      version: typeof v.version === 'string' ? v.version : null,
      url: typeof v.url === 'string' ? v.url : null,
      password: typeof v.password === 'string' ? v.password : null,
    };
  } catch {
    return null;
  }
}

/** codex 会话解析结果：cwd + 尾部最后一条事件（含时间戳） */
export interface CodexSessionInfo {
  cwd: string | null;
  lastTsMs: number | null;
  lastEvent: { type: string; payloadType?: string; role?: string } | null;
}

/**
 * 解析 codex session jsonl：头部找 session_meta.payload.cwd，尾部倒扫最后一条有效事件。
 * 文件不可读 / 空 → null。
 */
export async function parseCodexSession(jsonlPath: string): Promise<CodexSessionInfo | null> {
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

  // 尾部倒扫：最后一条可解析的事件（type/payloadType/role）+ 它的 timestamp
  let lastTsMs: number | null = null;
  let lastEvent: CodexSessionInfo['lastEvent'] = null;
  const start = Math.max(0, st.size - JSONL_SNIP);
  const tail = await readChunk(start, st.size - start);
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { type?: unknown; timestamp?: unknown; payload?: { type?: unknown; role?: unknown } };
      if (lastEvent === null) {
        lastEvent = {
          type: typeof obj.type === 'string' ? obj.type : '',
          payloadType: typeof obj.payload?.type === 'string' ? obj.payload.type : undefined,
          role: typeof obj.payload?.role === 'string' ? obj.payload.role : undefined,
        };
      }
      if (lastTsMs === null && typeof obj.timestamp === 'string') {
        const m = Date.parse(obj.timestamp);
        if (!Number.isNaN(m)) lastTsMs = m;
      }
      if (lastEvent !== null && lastTsMs !== null) break;
    } catch {
      // 跳过坏行 / 截断行
    }
  }

  return { cwd, lastTsMs, lastEvent };
}

/** codex 尾部事件 → 忙态：reasoning=思考 / function_call·message.assistant=编辑 / 其余=空闲 */
export function codexEventToPhase(last: CodexSessionInfo['lastEvent']): LocalToolPhase {
  if (!last) return 'idle';
  if (last.type === 'response_item') {
    switch (last.payloadType) {
      case 'reasoning':
        return 'thinking';
      case 'function_call':
      case 'function_call_output':
      case 'custom_tool_call':
      case 'custom_tool_call_output':
      case 'message':
        return last.payloadType === 'message' && last.role !== 'assistant' ? 'idle' : 'editing';
      default:
        return 'idle';
    }
  }
  // event_msg / token_usage_record → 一轮/任务结束
  return 'idle';
}

/** opencode HTTP Basic auth header：用户名固定 opencode，密码即 service.json 的 password */
export function openCodeBasicAuth(password: string): string {
  return `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
}

/** opencode 会话解析：cwd / title（剥 XML 状态标签）/ phase / updatedMs */
export interface OpenCodeSessionInfo {
  cwd: string | null;
  title: string | null;
  phase: LocalToolPhase;
  updatedMs: number | null;
}

/** opencode 的 title 用 XML 标签标记运行状态：<thinking>… / <tools>…；无标签 = 已完成/空闲 */
const OPENCODE_PHASE_TAGS: Array<[LocalToolPhase, RegExp]> = [
  ['thinking', /<thinking>/i],
  ['editing', /<(?:tools?|tool_call|write)/i],
];

/** 从 opencode /api/session 响应中提取会话数组（支持裸数组 / {data} / {sessions} 三种形状） */
export function extractOpenCodeSessions(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = (data as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
    const s = (data as { sessions?: unknown }).sessions;
    if (Array.isArray(s)) return s;
  }
  return [];
}

/** 解析 opencode /api/session 返回的单个会话对象 */
export function parseOpenCodeSession(
  json: unknown,
  now: number,
  activeWindowMs: number,
): OpenCodeSessionInfo | null {
  if (!json || typeof json !== 'object') return null;
  const s = json as {
    title?: string;
    location?: { directory?: string };
    time?: { updated?: number; idle?: number };
  };
  const rawTitle = typeof s.title === 'string' ? s.title : '';
  const lower = rawTitle.toLowerCase();

  let phase: LocalToolPhase = 'idle';
  let hasTag = false;
  for (const [p, re] of OPENCODE_PHASE_TAGS) {
    if (re.test(lower)) {
      phase = p;
      hasTag = true;
      break;
    }
  }
  const updatedMs = typeof s.time?.updated === 'number' ? s.time.updated : null;
  // 标题无状态标签时才按活跃度推断：刚更新 → 编辑中
  if (!hasTag && updatedMs != null && now - updatedMs <= activeWindowMs) {
    phase = 'editing';
  }
  // 去掉 XML 状态标签并压缩空白
  const title = rawTitle.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  return {
    cwd: typeof s.location?.directory === 'string' ? s.location.directory : null,
    title,
    phase,
    updatedMs,
  };
}

/** mcode sqlite 查询结果（来自外部 node 输出 JSON 的首行） */
export interface McodeSessionInfo {
  status: string | null;
  title: string | null;
  workspaceDir: string | null;
  updatedAtMs: number | null;
}

/** 解析外部 node 查询 mcode runtime-state.sqlite 的 stdout */
export function parseMcodeSqliteOutput(stdout: string): McodeSessionInfo | null {
  try {
    const rows = JSON.parse(stdout) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const r = rows[0];
    return {
      status: typeof r.status === 'string' ? r.status : null,
      title: typeof r.title === 'string' ? r.title : null,
      workspaceDir: typeof r.workspace_dir === 'string' ? r.workspace_dir : null,
      updatedAtMs: typeof r.updated_at_ms === 'number' ? r.updated_at_ms : null,
    };
  } catch {
    return null;
  }
}

/** mcode status → 忙态（枚举不透明：idle 之外一律视为工作中） */
export function mcodeStatusToPhase(status: string | null): LocalToolPhase {
  if (!status || status === 'idle') return 'idle';
  return 'editing';
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

/** 组装单个工具状态：phase 决定 state；未运行强制 offline；无 phase 时按活跃度推断 */
export function buildToolStatus(
  running: boolean,
  phase: LocalToolPhase | null,
  lastActive: number | null,
  now: number,
  activeWindowMs: number,
  extra: { cwd?: string | null; title?: string | null; detail?: string | null } = {},
): LocalToolStatus {
  let finalPhase: LocalToolPhase = 'offline';
  if (running) {
    finalPhase = phase ?? (lastActive != null && now - lastActive <= activeWindowMs ? 'editing' : 'idle');
  }
  const state: LocalToolState =
    finalPhase === 'thinking' || finalPhase === 'editing' ? 'working' : finalPhase === 'idle' ? 'idle' : 'offline';
  return {
    running,
    state,
    phase: finalPhase,
    cwd: extra.cwd ?? null,
    title: extra.title ?? null,
    lastActive,
    detail: extra.detail ?? null,
  };
}

// ==================== 平台层 ====================

function execFileAsync(cmd: string, args: string[], timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
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

/** fetch 带超时，失败返回 null */
async function fetchWithTimeout(url: string, opts: RequestInit, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 通过 opencode HTTP API 拿当前会话（Basic auth: opencode:<password>） */
async function fetchOpenCodeSession(
  url: string,
  password: string,
  now: number,
  activeWindowMs: number,
): Promise<OpenCodeSessionInfo | null> {
  try {
    const r = await fetchWithTimeout(
      `${url}/api/session?limit=1`,
      { headers: { Authorization: openCodeBasicAuth(password) } },
      API_TIMEOUT_MS,
    );
    if (!r || !r.ok) return null;
    const data = (await r.json().catch(() => null)) as unknown;
    const list = extractOpenCodeSessions(data);
    if (list.length === 0) return null;
    return parseOpenCodeSession(list[0], now, activeWindowMs);
  } catch {
    return null;
  }
}

/** 用外部 node（v22.5+ 才有 node:sqlite）查 mcode runtime-state.sqlite，失败返回 null */
async function queryMcodeSqlite(dbPath: string): Promise<McodeSessionInfo | null> {
  let exists = false;
  try {
    exists = fs.existsSync(dbPath);
  } catch {
    exists = false;
  }
  if (!exists) return null;
  const script =
    "const{DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});" +
    "try{const rows=db.prepare(\"SELECT session_id,status,title,workspace_dir,updated_at_ms FROM local_runtime_sessions WHERE archived=0 ORDER BY updated_at_ms DESC LIMIT 3\").all();" +
    "process.stdout.write(JSON.stringify(rows));}finally{db.close();}";
  try {
    const stdout = await execFileAsync('node', ['-e', script, dbPath], SQLITE_TIMEOUT_MS);
    return parseMcodeSqliteOutput(stdout);
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
    let phase: LocalToolPhase | null = null;
    if (latest) {
      const info = await parseCodexSession(latest.path);
      cwd = info?.cwd ?? null;
      lastActive = info?.lastTsMs ?? latest.mtimeMs;
      if (info?.lastEvent) phase = codexEventToPhase(info.lastEvent);
    }
    const detail = classifyCodexCwd(cwd) === 'desktop' ? 'ChatGPT 桌面客户端' : cwd ? 'Codex CLI' : null;
    return buildToolStatus(running, phase, lastActive, now, activeWindowMs, { cwd, detail });
  }

  private async collectMcode(
    home: string,
    now: number,
    activeWindowMs: number,
  ): Promise<LocalToolStatus> {
    const active = readActiveMarker(path.join(home, '.minimax-code', '.mcode-active'));
    const running = active ? isPidAlive(active.pid) : false;

    // 权威状态优先：sqlite（status/title/workspace_dir）；失败降级会话文件 mtime
    let phase: LocalToolPhase | null = null;
    let title: string | null = null;
    let cwd: string | null = null;
    let lastActive: number | null = null;
    const info = await queryMcodeSqlite(path.join(home, '.minimax', 'v2', 'sqlite', 'runtime-state.sqlite'));
    if (info) {
      phase = mcodeStatusToPhase(info.status);
      title = info.title;
      cwd = info.workspaceDir;
      lastActive = info.updatedAtMs;
    }
    if (lastActive == null) {
      const latest = await findLatestFile(path.join(home, '.minimax', 'v2', 'sessions'), {
        ext: ['.jsonl', '.json'],
      });
      lastActive = latest?.mtimeMs ?? null;
      if (active && (lastActive == null || active.startedAtMs > lastActive)) lastActive = active.startedAtMs;
    }

    const version = readTextFile(path.join(home, '.minimax-code', 'current'))?.trim() ?? null;
    return buildToolStatus(running, phase, lastActive, now, activeWindowMs, {
      cwd,
      title,
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

    let phase: LocalToolPhase | null = null;
    let title: string | null = null;
    let cwd: string | null = null;
    let lastActive: number | null = null;
    if (running && service?.url && service.password) {
      const sess = await fetchOpenCodeSession(service.url, service.password, now, activeWindowMs);
      if (sess) {
        cwd = sess.cwd;
        title = sess.title;
        phase = sess.phase;
        lastActive = sess.updatedMs;
      }
    }
    if (lastActive == null) {
      const latest = await findLatestFile(path.join(home, '.local', 'share', 'opencode'), {
        ext: ['.db', '.json', '.jsonl'],
      });
      lastActive = latest?.mtimeMs ?? null;
    }

    const url = service?.url?.replace(/^https?:\/\//, '') ?? null;
    const detail = service
      ? [url, service.version ? `v${service.version}` : null].filter(Boolean).join(' · ')
      : null;
    return buildToolStatus(running, phase, lastActive, now, activeWindowMs, { cwd, title, detail });
  }
}
