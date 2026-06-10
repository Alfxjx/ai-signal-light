const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { AIDetector } = require('./detector');

/**
 * 状态服务器 - 提供 WebSocket 实时推送和 HTTP API
 */
class StatusServer {
  constructor(port = 3456, options = {}) {
    this.port = port;
    this.detector = new AIDetector();
    this.configStore = options.configStore || null;
    this.usageMonitor = options.usageMonitor || null;
    this.wss = null;
    this.httpServer = null;
    this.clients = new Set();
  }

  start() {
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
      }));

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
        }));
      }

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'refresh') {
            console.log('[Server] user requested refresh');
            this.detector.checkAll();
            if (this.usageMonitor) this.usageMonitor.checkAll();
          }
        } catch (e) {
          // 忽略非 JSON 消息
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('[Server] Client disconnected');
      });

      ws.on('error', (err) => {
        console.error('[Server] WebSocket error:', err);
      });
    });

    // 注册状态变更回调，推送给所有客户端
    this.detector.onStatusChange((assistantId, status, assistant) => {
      const message = JSON.stringify({
        type: 'statusChange',
        assistantId,
        status,
        data: assistant
      });

      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    // 注册用量更新回调，推送给所有客户端
    if (this.usageMonitor) {
      this.usageMonitor.onUpdate((payload) => {
        const message = JSON.stringify({
          type: 'usageUpdate',
          ...payload
        });
        this.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      });
    }

    // 启动检测器
    this.detector.start();

    // 启动服务器
    this.httpServer.listen(this.port, () => {
      console.log(`[Server] Status server started: http://localhost:${this.port}`);
    });

    return this;
  }

  handleHttp(req, res) {
    const url = req.url;

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
      const assistantId = url.split('/').pop();
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
      const assistantId = url.split('/').pop();
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { status, details } = JSON.parse(body);
          const success = this.detector.setManualStatus(assistantId, status, details || {});
          res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success, assistantId, status }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid body' }));
        }
      });
      return;
    }

    // 静态文件服务（来自 Vite 构建产物 src/renderer/dist）
    const STATIC_ROOT = path.join(__dirname, 'renderer', 'dist');
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
    const contentType = {
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
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fs.readFileSync(filePath));
  }

  stop() {
    this.detector.stop();
    if (this.wss) this.wss.close();
    if (this.httpServer) this.httpServer.close();
  }
}

module.exports = { StatusServer };
