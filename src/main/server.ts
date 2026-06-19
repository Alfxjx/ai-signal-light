import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { AIDetector } from './detector';
import { WS_PORT } from '../shared/constants';
import { normalizeCwd } from '../shared/utils/cwd';
import type { ConfigStore } from './config';
import type { UsageMonitor } from './usage-monitor';
import type { WsMessage, PendingHook } from '../shared/types/websocket';

interface ServerOptions {
  configStore?: ConfigStore | null;
  usageMonitor?: UsageMonitor | null;
}

/**
 * 状态服务器 - 提供 WebSocket 实时推送和 HTTP API
 */
export class StatusServer {
  private port: number;
  private detector: AIDetector;
  private configStore: ConfigStore | null;
  private usageMonitor: UsageMonitor | null;
  private wss: WebSocket.Server | null = null;
  private httpServer: http.Server | null = null;
  private clients = new Set<WebSocket>();
  // 跨窗口共享的 hook 待办状态。主窗口消费（点项目 / 收到新响应）后通过 IPC 通知清除
  private pendingByCwd = new Map<string, PendingHook>();

  constructor(port = WS_PORT, options: ServerOptions = {}) {
    this.port = port;
    this.detector = new AIDetector();
    this.configStore = options.configStore || null;
    this.usageMonitor = options.usageMonitor || null;
  }

  start(): this {
    // 创建 HTTP 服务器（同时服务静态文件和 API）
    this.httpServer = http.createServer((req, res) => {
      this.handleHttp(req, res);
    });

    // 创建 WebSocket 服务器，并校验 upgrade 请求的 Authorization
    this.wss = new WebSocket.Server({
      server: this.httpServer,
      verifyClient: (info, cb) => {
        if (this.isLocalRequest(info.req)) {
          cb(true);
          return;
        }
        if (this.verifyAuth(info.req)) {
          cb(true);
          return;
        }
        cb(false, 401, 'Unauthorized');
      }
    });

    this.wss.on('connection', (ws) => {
      console.log('[Server] Client connected');
      this.clients.add(ws);

      // 发送当前状态（捎带 pending 快照，让新客户端立刻知道有未消费的通知）
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          ...this.detector.getAllStatus(),
          pending: this.getPendingSnapshot()
        }
      } as WsMessage));

      // 发送当前用量快照
      if (this.usageMonitor) {
        const cfg = this.configStore ? this.configStore.get() : null;
        ws.send(JSON.stringify({
          type: 'usageInit',
          data: {
            kimi:    this.usageMonitor.state.kimi,
            minimax: this.usageMonitor.state.minimax,
            copilot: this.usageMonitor.state.copilot,
            enabled: cfg ? {
              kimi:    cfg.kimi.enabled,
              minimax: cfg.minimax.enabled,
              copilot: cfg.copilot.enabled
            } : { kimi: true, minimax: true, copilot: true },
            intervalMinutes: cfg ? cfg.intervalMinutes : 10,
            thresholds:      cfg ? cfg.thresholds      : { warn: 50, danger: 80 }
          }
        } as WsMessage));
      }

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string };
          if (msg.type === 'refresh') {
            console.log('[Server] user requested refresh');
            this.detector.checkAll();
            if (this.usageMonitor) this.usageMonitor.checkAll();
          }
        } catch (err) {
          console.warn('[Server] WS message handler error:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[Server] Client disconnected');
      });

      ws.on('error', (err: Error) => {
        console.error('[Server] WebSocket error:', err);
      });
    });

    // 注册状态变更回调，推送给所有客户端
    this.detector.onStatusChange((assistantId, status, assistant) => {
      this.broadcast({
        type: 'statusChange',
        assistantId,
        status,
        data: assistant as unknown as { status?: string; details: { projects: unknown[] } }
      } as WsMessage);
    });

    // 注册用量更新回调，推送给所有客户端
    if (this.usageMonitor) {
      this.usageMonitor.onUpdate((payload) => {
        this.broadcast({ type: 'usageUpdate', ...payload } as WsMessage);
      });
    }

    // 注册配置变更回调：阈值变化时推送给所有客户端
    if (this.configStore) {
      this.configStore.onChange((cfg) => {
        this.broadcast({ type: 'thresholdsChanged', thresholds: cfg.thresholds } as WsMessage);
      });
    }

    // 启动检测器
    this.detector.start();

    // 根据 lanMode 决定绑定地址：localhost-only 或 LAN
    const cfg = this.configStore?.get();
    const lanEnabled = cfg?.lanMode?.enabled ?? false;
    const host = lanEnabled ? '0.0.0.0' : '127.0.0.1';
    this.httpServer.listen(this.port, host, () => {
      console.log(`[Server] Status server started: http://${host}:${this.port} (lanMode=${lanEnabled})`);
    });

    return this;
  }

  // 向所有打开的 WS 客户端广播一条消息
  broadcast(msg: WsMessage): void {
    const payload = JSON.stringify(msg);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private isLocalRequest(req: http.IncomingMessage): boolean {
    const addr = req.socket.remoteAddress || '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  }

  private getExpectedApiKey(): string | null {
    return this.configStore?.get().lanMode?.apiKey || null;
  }

  private verifyAuth(req: http.IncomingMessage): boolean {
    const expected = this.getExpectedApiKey();
    if (!expected) return false;
    const auth = req.headers.authorization || '';
    return auth === `Bearer ${expected}`;
  }

  private requireAuth(req: http.IncomingMessage, res: http.ServerResponse, next: () => void): void {
    if (this.isLocalRequest(req)) {
      next();
      return;
    }
    const cfg = this.configStore?.get();
    if (!cfg?.lanMode?.enabled) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'LAN mode is not enabled' }));
      return;
    }
    if (this.verifyAuth(req)) {
      next();
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // API: 获取所有状态
    if (url === '/api/status') {
      this.requireAuth(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.detector.getAllStatus()));
      });
      return;
    }

    // API: 获取单个助手状态
    if (url.startsWith('/api/status/')) {
      this.requireAuth(req, res, () => {
        const assistantId = url.split('/').pop() || '';
        const status = this.detector.getStatus(assistantId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status || { error: 'not found' }));
      });
      return;
    }

    // API: 获取用量快照
    if (url === '/api/usage') {
      this.requireAuth(req, res, () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.usageMonitor ? this.usageMonitor.snapshot() : {}));
      });
      return;
    }

    // API: 手动设置状态 (POST /api/status/:id)
    if (req.method === 'POST' && url.startsWith('/api/status/')) {
      this.requireAuth(req, res, () => {
        const assistantId = url.split('/').pop() || '';
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const { status, details } = JSON.parse(body) as { status: string; details?: Record<string, unknown> };
            const success = this.detector.setManualStatus(assistantId, status, details || {});
            res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success, assistantId, status }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid body' }));
          }
        });
      });
      return;
    }

    // API: Claude Code hooks 事件入口
    if (req.method === 'POST' && url === '/api/hooks/claude') {
      this.requireAuth(req, res, () => {
        this.handleHookEvent(req, res);
      });
      return;
    }

    // 静态文件服务（来自 Vite 构建产物 dist/renderer）
    // 静态文件仅允许本机访问；LAN 客户端不需要桌面 UI
    if (!this.isLocalRequest(req)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const STATIC_ROOT = path.join(__dirname, '..', 'renderer');
    let filePath = path.join(STATIC_ROOT, url === '/' ? 'index.html' : url);

    // 安全检查
    if (!filePath.startsWith(STATIC_ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2'
    };
    res.writeHead(200, { 'Content-Type': contentType[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  }

  stop(): void {
    this.detector.stop();
    if (this.wss) this.wss.close();
    if (this.httpServer) this.httpServer.close();
  }

  restart(): void {
    console.log('[Server] Restarting due to LAN mode change...');
    this.stop();
    // 给 close 一点异步时间
    setTimeout(() => this.start(), 100);
  }

  isLanEnabled(): boolean {
    return this.configStore?.get().lanMode?.enabled ?? false;
  }

  // 处理 Claude Code hook POST: 校验、按 config gating，再 broadcast
  private handleHookEvent(req: http.IncomingMessage, res: http.ServerResponse): void {
    const MAX_BODY = 64 * 1024;
    const WHITELIST = new Set(['Notification', 'Stop', 'PreToolUse']);

    let body = '';
    let aborted = false;
    req.on('data', (chunk: string) => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'body too large' }));
        try { req.destroy(); } catch { /* ignore */ }
      }
    });
    req.on('end', () => {
      if (aborted) return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body || '{}') as Record<string, unknown>;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid body' }));
        return;
      }

      const event = (parsed.hook_event_name || parsed.event) as string;
      if (!event || !WHITELIST.has(event)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unsupported event' }));
        return;
      }
      const eventTyped = event as 'Notification' | 'Stop' | 'PreToolUse';

      // 配置 gating：用户关掉的事件直接静默丢弃
      const enabled = this.configStore?.get().hooks?.enabled ?? null;
      if (enabled && enabled[eventTyped] === false) {
        res.writeHead(204);
        res.end();
        return;
      }

      const sessionId = (parsed.session_id || parsed.sessionId || null) as string | null;
      const rawCwd = typeof parsed.cwd === 'string' ? parsed.cwd : null;
      const cwd = normalizeCwd(rawCwd, process.platform === 'win32');
      const message = typeof parsed.message === 'string' ? parsed.message : undefined;
      const toolName = typeof parsed.tool_name === 'string' ? parsed.tool_name : undefined;

      this.broadcast({
        type: 'claudeHook',
        event: eventTyped,
        cwd,
        sessionId,
        ts: Date.now(),
        message,
        toolName
      });

      // 同步维护跨窗口的 pending 状态
      if (cwd) {
        this.pendingByCwd.set(cwd, { event: eventTyped, ts: Date.now(), message, toolName });
        this.broadcast({
          type: 'pendingChanged',
          byCwd: Object.fromEntries(this.pendingByCwd)
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    req.on('error', () => { aborted = true; });
  }

  // 主窗口通过 IPC 通知某 cwd 的 pending 已被消费（点开了项目 / 收到新响应）
  // 同步清除 + 广播给所有 WS 客户端（含悬浮球）
  clearPendingByCwd(cwd: string): void {
    const key = normalizeCwd(cwd, process.platform === 'win32');
    if (!key) return;
    if (this.pendingByCwd.delete(key)) {
      this.broadcast({
        type: 'pendingChanged',
        byCwd: Object.fromEntries(this.pendingByCwd)
      });
    }
  }

  // 暴露当前 pending 快照给新连接的客户端（在 init 消息里捎带）
  getPendingSnapshot(): Record<string, PendingHook> {
    return Object.fromEntries(this.pendingByCwd);
  }
}
