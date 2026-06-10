import { ref, onBeforeUnmount } from 'vue';
import type { WsMessage } from '../types/messages';

// 开发环境下 Vite 在 5173，但 WS 服务仍在 3456（Electron 主进程启动的 server.js）；
// 生产环境页面由 server.js 自身在 3456 提供，window.location.host 即对。
function resolveWsUrl(): string {
  const host = import.meta.env.DEV ? 'localhost:3456' : window.location.host;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}`;
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const isConnected = ref(false);
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manualClosed = false;

  function connect() {
    const wsUrl = resolveWsUrl();
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected', wsUrl);
        isConnected.value = true;
        reconnectDelay = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;
          onMessage(message);
        } catch (e) {
          console.error('[WS] Message parse failed:', e);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Connection closed');
        isConnected.value = false;
        if (!manualClosed) scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        isConnected.value = false;
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      connect();
    }, reconnectDelay);
  }

  function send(payload: unknown): boolean {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    console.warn('[WS] Not connected, cannot send', payload);
    return false;
  }

  function disconnect() {
    manualClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }

  onBeforeUnmount(disconnect);

  return { isConnected, connect, send, disconnect };
}
