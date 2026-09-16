/**
 * Kimi Code (web) 实时状态监控。
 *
 * 读取本机 kimi web 服务（REST + WebSocket），把会话忙态 → 按 cwd 归并成目录列表，
 * 并为整卡聚合四态：待审核 > 编辑中 > 思考中 > 空闲（服务不可达为 offline）。
 *
 * 实现参照 `Kimi-pet-engine`（已验证可行）：
 * - 服务发现：读 ~/.kimi-code/server.token 拿 token；端口读
 *   ~/.kimi-code/server/instances/*.json 自报的 port，兜底 58627 起探 100 个端口；
 *   探活 GET /api/v1/healthz。
 * - WS：/api/v1/ws，鉴权 header `Sec-WebSocket-Protocol: kimi-code.bearer.<token>`，
 *   先 subscribe 会话，收到 ping 必须回 pong（否则 30s 被掐线）。
 * - REST 校准：每 3s GET /api/v1/sessions，用 busy / pending_interaction 兜底
 *   漏掉的事件；连续失败 3 次判定连接已死，断开重连。
 *
 * 注意：该 API 是实验性的，字段可能随 Kimi Code 版本变化。
 */

import WebSocket from 'ws';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { normalizeCwd } from '../shared/utils/cwd';
import type {
  KimiAggregateState,
  KimiProject,
  KimiSessionState,
  KimiStatus,
  RestSession,
} from '../shared/types/kimi';

// 端口：官方文档端口占用至多递增重试 100 次
const BASE_PORT = 58627;
const MAX_PORT_TRIES = 100;
// 断线重连 / 发现重试间隔
const RETRY_DELAY_MS = 5000;
// REST 轮询间隔（校准 + 刷新会话列表）
const POLL_INTERVAL_MS = 3000;
// REST 轮询连续失败该次数后判定连接已死，断开重连
const REST_FAIL_BREAK = 3;

// ==================== 纯函数（便于单测） ====================

/**
 * WS `agent.status.updated` 的 phase.kind → 会话忙态。
 * 返回 null 表示该 phase 不影响忙态（轮次结束/空闲）。
 */
export function mapPhase(phase: { kind?: string; stream?: string } | null | undefined): KimiSessionState | null {
  if (!phase || !phase.kind) return null;
  switch (phase.kind) {
    case 'running':
    case 'tool_call':
      return 'thinking';
    case 'streaming':
      // 思考流算思考，正文流算编辑
      return phase.stream === 'thinking' ? 'thinking' : 'editing';
    case 'idle':
    case 'done':
    case 'completed':
      return null;
    default:
      // 未知 kind，打日志留后路（服务端可能新增枚举）
      console.warn('[kimi] 未知 phase kind:', phase.kind);
      return null;
  }
}

const STATE_RANK: Record<KimiSessionState, number> = { idle: 0, thinking: 1, editing: 2, approval: 3 };

function betterState(a: KimiSessionState, b: KimiSessionState): KimiSessionState {
  return STATE_RANK[b] > STATE_RANK[a] ? b : a;
}

/** 聚合多个会话忙态为头部状态：任一待审核 > 任一编辑中 > 任一思考中 > 全空闲 */
export function aggregateState(states: Iterable<KimiSessionState>): KimiAggregateState {
  let result: KimiAggregateState = 'idle';
  for (const s of states) {
    if (s === 'approval') return 'approval';
    if (s === 'editing') {
      result = 'editing';
    } else if (s === 'thinking' && result === 'idle') {
      result = 'thinking';
    }
  }
  return result;
}

function toMs(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function dirName(cwd: string): string {
  return path.basename(cwd.replace(/[\\/]+$/, '')) || cwd;
}

/**
 * 把 REST 会话列表 + 忙态表，按 cwd 归并成"项目"行。
 * 无 cwd 的会话退化为 workspace_id / 自身 id 分组，显示名用会话标题。
 * isWin 用于 normalizeCwd 的大小写归一化（Windows 不敏感）。
 */
export function buildProjects(
  rest: RestSession[],
  busy: Map<string, KimiSessionState>,
  isWin: boolean,
): KimiProject[] {
  const map = new Map<string, KimiProject>();
  for (const s of rest) {
    const cwd = s.metadata?.cwd || null;
    // key 用归一化（win 小写）保证同一目录大小写不同也能合并；显示名用原始 cwd，避免被小写化
    const norm = cwd ? normalizeCwd(cwd, isWin) ?? cwd : null;
    const key = norm
      ? `cwd:${norm}`
      : s.workspace_id
        ? `ws:${s.workspace_id}`
        : `id:${s.id}`;
    let proj = map.get(key);
    if (!proj) {
      proj = {
        id: key,
        name: cwd ? dirName(cwd) : s.title || s.id,
        cwd,
        lastResponse: null,
        state: 'idle',
        pending: false,
      };
      map.set(key, proj);
    }
    const at = toMs(s.updated_at) ?? toMs(s.created_at) ?? null;
    if (at && (proj.lastResponse == null || at > proj.lastResponse)) {
      proj.lastResponse = at;
    }
    const busyState = busy.get(s.id);
    if (busyState) proj.state = betterState(proj.state, busyState);
    if (s.pending_interaction && s.pending_interaction !== 'none') proj.pending = true;
  }
  return [...map.values()].sort((a, b) => (b.lastResponse ?? 0) - (a.lastResponse ?? 0));
}

/**
 * 用 REST 权威的 busy / pending_interaction 校准忙态表。
 * 待处理交互 > 忙碌 > 空闲；不覆盖 WS 已给出的更细状态（editing 等）。
 * 返回是否有变化。
 */
export function reconcile(
  busy: Map<string, KimiSessionState>,
  rest: RestSession[],
): boolean {
  let changed = false;
  for (const s of rest) {
    const prev = busy.get(s.id);
    const pending = !!(s.pending_interaction && s.pending_interaction !== 'none');
    let next: KimiSessionState | null;
    if (pending) {
      next = 'approval';
    } else if (s.busy) {
      next = prev && prev !== 'approval' ? prev : 'thinking';
    } else {
      next = null; // 空闲：从忙态表移除
    }
    if (prev !== next) {
      changed = true;
      if (next) busy.set(s.id, next);
      else busy.delete(s.id);
    }
  }
  return changed;
}

// ==================== 网络层 ====================

function readToken(): string | null {
  try {
    const t = fs.readFileSync(path.join(os.homedir(), '.kimi-code', 'server.token'), 'utf8').trim();
    return t || null;
  } catch {
    return null;
  }
}

function readInstancePorts(): number[] {
  const ports: number[] = [];
  const dir = path.join(os.homedir(), '.kimi-code', 'server', 'instances');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return ports;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const v = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { port?: number };
      if (typeof v.port === 'number') ports.push(v.port);
    } catch {
      // 忽略坏文件
    }
  }
  return ports;
}

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

async function healthzOk(port: number): Promise<boolean> {
  const r = await fetchWithTimeout(`http://127.0.0.1:${port}/api/v1/healthz`, {}, 800);
  return !!r && r.ok;
}

/** 发现本地 kimi web 服务端口：实例清单自报优先，再并发扫默认端口段 */
async function findPort(): Promise<number | null> {
  const preferred = readInstancePorts();
  const candidates = Array.from(
    new Set([...preferred, ...Array.from({ length: MAX_PORT_TRIES }, (_, i) => BASE_PORT + i)]),
  );
  const hits = (await Promise.all(candidates.map(async (p) => ((await healthzOk(p)) ? p : null))))
    .filter((p): p is number => p !== null);
  const preferredHit = preferred.find((p) => hits.includes(p));
  return preferredHit ?? (hits.length ? Math.min(...hits) : null);
}

async function fetchSessions(port: number, token: string): Promise<RestSession[] | null> {
  const r = await fetchWithTimeout(
    `http://127.0.0.1:${port}/api/v1/sessions?page_size=100`,
    { headers: { Authorization: `Bearer ${token}` } },
    2000,
  );
  if (!r) return null;
  const json = (await r.json().catch(() => null)) as { data?: { items?: RestSession[] } | RestSession[] } | null;
  if (!json) return null;
  const data = json.data;
  const items = Array.isArray(data) ? data : data?.items;
  return Array.isArray(items) ? items : null;
}

// ==================== 监控器 ====================

export type KimiStatusCallback = (status: KimiStatus) => void;

export class KimiMonitor {
  private onChangeCb: KimiStatusCallback | null = null;

  private ws: WebSocket | null = null;
  private token: string | null = null;
  private port: number | null = null;

  /** 最近一次 REST 会话快照；忙态 overlay 维持 WS 提供的更细状态 */
  private lastRest: RestSession[] | null = null;
  /** 会话 id → 实时忙态 */
  private busy = new Map<string, KimiSessionState>();
  /** 服务在线标志：成功连上/轮询成功为 true */
  private online = false;

  private pollTimer: NodeJS.Timeout | null = null;
  private restFailures = 0;
  private lastKey = '';
  private stopped = false;

  onStatusChange(cb: KimiStatusCallback): void {
    this.onChangeCb = cb;
  }

  getStatus(): KimiStatus {
    return this.buildStatus();
  }

  /** 手动刷新（托盘/面板 refresh 事件） */
  refresh(): void {
    this.pollOnce();
  }

  start(): void {
    if (this.stopped) return;
    this.token = readToken();
    // 立即跑一轮（发现 + 轮询），再定时轮询
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.closeWs();
  }

  private buildStatus(): KimiStatus {
    const projects = buildProjects(this.lastRest ?? [], this.busy, process.platform === 'win32');
    const state: KimiAggregateState = this.online
      ? aggregateState(this.busy.values())
      : 'offline';
    return {
      available: this.online,
      state,
      projects,
      lastUpdate: Date.now(),
    };
  }

  /** 构建并推送，仅在有实质变化时广播（避免 3s 无谓刷新） */
  private publish(): void {
    const status = this.buildStatus();
    const key = JSON.stringify({ available: status.available, state: status.state, projects: status.projects });
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.onChangeCb?.(status);
  }

  private closeWs(): void {
    if (this.ws) {
      try { this.ws.terminate(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  /** 每个轮询周期做一次：发现/保障连接 → 拉会话 → 校准 → 推送 */
  private pollOnce(): void {
    if (!this.port) {
      findPort().then((p) => {
        if (!p) return;
        this.port = p;
        if (!this.token) this.token = readToken();
        if (this.token) void this.pollSessions();
      });
      return;
    }
    void this.pollSessions();
  }

  private async pollSessions(): Promise<void> {
    if (!this.port || !this.token) return;
    const rest = await fetchSessions(this.port, this.token);
    if (rest === null) {
      // 服务无响应/挂死
      this.restFailures += 1;
      if (this.restFailures >= REST_FAIL_BREAK) {
        this.port = null;                    // 强制重新发现
        this.closeWs();
        if (this.online) {
          this.online = false;
          this.publish();
        }
      }
      return;
    }
    this.restFailures = 0;
    if (!this.online) { this.online = true; }
    this.lastRest = rest;
    reconcile(this.busy, rest);
    // 确保 WS 连上（首次发现端口后连接可能还没建好）
    if (!this.ws) this.connectWs();
    this.publish();
  }

  private connectWs(): void {
    if (this.ws || !this.port || !this.token) return;
    const url = `ws://127.0.0.1:${this.port}/api/v1/ws`;
    let ws: WebSocket;
    try {
      // 鉴权：Sec-WebSocket-Protocol = kimi-code.bearer.<token>
      ws = new WebSocket(url, `kimi-code.bearer.${this.token}`);
    } catch (e) {
      console.warn('[kimi] WS 连接失败：', (e as Error).message);
      return;
    }
    this.ws = ws;

    ws.on('open', () => {
      if (!this.online) {
        this.online = true;
        this.publish();
      }
      this.subscribeCurrent();
    });

    ws.on('message', (data: WebSocket.RawData) => { this.handleWsMessage(data); });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      // 轮询仍会维持 online；只有 restFailures 满才真正下线
    });

    ws.on('error', () => {
      try { ws.terminate(); } catch { /* ignore */ }
      if (this.ws === ws) this.ws = null;
    });
  }

  private subscribeCurrent(): void {
    if (!this.ws || !this.lastRest || this.lastRest.length === 0) return;
    const ids = this.lastRest.map((s) => s.id);
    this.send({ type: 'subscribe', id: 'sub-kimi-0', payload: { session_ids: ids } });
  }

  private send(frame: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(frame)); } catch { /* ignore */ }
    }
  }

  private handleWsMessage(raw: WebSocket.RawData): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = typeof event.type === 'string' ? event.type : '';

    // 应用层心跳：必须回 pong，否则服务端约 30s 掐线
    if (type === 'ping') {
      this.send({ type: 'pong', payload: event.payload ?? null });
      return;
    }

    // 全局事件：新会话创建时补订阅
    if (type === 'event.session.created') {
      const id = (event.payload as Record<string, unknown> | undefined)?.sessionId as string | undefined
        ?? (event.payload as Record<string, unknown> | undefined)?.id as string | undefined;
      if (id) this.send({ type: 'subscribe', id: 'sub-kimi-add', payload: { session_ids: [id] } });
      return;
    }

    const sessionId = typeof event.session_id === 'string' ? event.session_id : '';
    if (!sessionId) return;

    switch (type) {
      case 'agent.status.updated': {
        const phase = (event.payload as { phase?: { kind?: string; stream?: string } } | undefined)?.phase;
        const state = mapPhase(phase);
        if (state) this.busy.set(sessionId, state);
        else this.busy.delete(sessionId);
        this.publish();
        break;
      }
      case 'event.approval.requested':
      case 'event.question.requested':
        this.busy.set(sessionId, 'approval');
        this.publish();
        break;
      case 'event.approval.resolved':
      case 'event.question.answered':
      case 'event.question.dismissed':
        this.busy.set(sessionId, 'thinking');
        this.publish();
        break;
      case 'turn.ended':
      case 'turn.step.interrupted':
      case 'error':
        this.busy.delete(sessionId);
        this.publish();
        break;
      default:
        break;
    }
  }
}