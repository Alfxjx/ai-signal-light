import WebSocket from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { AIDetector } from './detector';
import type { ConfigStore } from './config';
import type { UsageMonitor } from './usage-monitor';
import type { WsMessage } from '../shared/types/websocket';

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

  constructor(port = 3456, options: ServerOptions = {}) {
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

    // 创建 WebSocket 服务器
    this.wss = new WebSocket.Server({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      console.log('[Server] Client connected');
      this.clients.add(ws);

      // 发送当前状态
      ws.send(JSON.stringify({
        type: 'init',
        data: this.detector.getAllStatus()
      } as WsMessage));

      // 发送当前用量快照
      if (this.usageMonitor) {
        ws.send(JSON.stringify({
          type: 'usageInit',
          data: {
            kimi:    this.usageMonitor.state.kimi,
            minimax: this.usageMonitor.state.minimax,
            copilot: this.usageMonitor.state.copilot,
            enabled: this.configStore ? {
              kimi:    this.configStore.get().kimi.enabled,
              minimax: this.configStore.get().minimax.enabled,
              copilot: this.configStore.get().copilot.enabled
            } : { kimi: true, minimax: true, copilot: true },
            intervalMinutes: this.configStore ? this.configStore.get().intervalMinutes : 10
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
        } catch {
          // 忽略非 JSON 消息
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

    // 启动检测器
    this.detector.start();

    // 启动服务器，仅绑定本机回环（hook 与渲染层都在本机）
    this.httpServer.listen(this.port, '127.0.0.1', () => {
      console.log(`[Server] Status server started: http://127.0.0.1:${this.port}`);
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.detector.getAllStatus()));
      return;
    }

    // API: 获取单个助手状态
    if (url.startsWith('/api/status/')) {
      const assistantId = url.split('/').pop() || '';
      const status = this.detector.getStatus(assistantId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status || { error: 'not found' }));
      return;
    }

    // API: 获取用量快照
    if (url === '/api/usage') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.usageMonitor ? this.usageMonitor.snapshot() : {}));
      return;
    }

    // API: 手动设置状态 (POST /api/status/:id)
    if (req.method === 'POST' && url.startsWith('/api/status/')) {
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
      return;
    }

    // API: Claude Code hooks 事件入口
    if (req.method === 'POST' && url === '/api/hooks/claude') {
      this.handleHookEvent(req, res);
      return;
    }

    // 静态文件服务（来自 Vite 构建产物 src/renderer/dist）
    const STATIC_ROOT = path.join(__dirname, '..', 'renderer', 'dist');
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
      const cwd = typeof parsed.cwd === 'string' ? parsed.cwd : null;
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    req.on('error', () => { aborted = true; });
  }
}
