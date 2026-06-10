/**
 * AI Assistant Status Monitor - Vue 3 Frontend
 * Supports WebSocket real-time updates
 *
 * v3: Migrated from vanilla JS classes to Vue 3 Options API
 */

const { createApp } = Vue;

createApp({
  data() {
    return {
      // 项目列表
      projects: [],
      rangeMs: 18000000,

      // 用量监控数据
      usage: {
        kimi: null,
        minimax: null,
        enabled: {}
      },

      // UI 状态
      isConnected: false,
      isCompact: true,
      isPinned: true,
      lastUpdate: null,
      isRefreshing: false,
      isUsageRefreshing: false,

      // 时间刷新 tick（供 formatAge / ageClass 响应式使用）
      now: Date.now(),

      // WebSocket
      ws: null,
      reconnectDelay: 1000,
      reconnectTimer: null,
      ageTimer: null,

      isElectron: !!window.electronAPI
    };
  },

  computed: {
    isElectronEnv() {
      return !!window.electronAPI;
    },

    filteredProjects() {
      return this.projects
        .filter(p => p.lastResponse)
        .filter(p => this.rangeMs === 0 || (this.now - new Date(p.lastResponse).getTime()) <= this.rangeMs)
        .sort((a, b) => new Date(b.lastResponse) - new Date(a.lastResponse));
    },

    lastUpdateText() {
      if (!this.lastUpdate) return '-';
      const date = new Date(this.lastUpdate);
      return `Last Update: ${date.toLocaleTimeString()}`;
    },

    usageLastTs() {
      const k = this.usage.kimi?.lastUpdated;
      const m = this.usage.minimax?.lastUpdated;
      if (k && m) return k > m ? k : m;
      return k || m || null;
    },

    allNoToken() {
      const kimiNoToken = this.usage.kimi?.error === 'no_token';
      const miniNoToken = this.usage.minimax?.error === 'no_token';
      return kimiNoToken && miniNoToken;
    },

    minimaxData() {
      return this.usage.minimax?.data || null;
    },

    minimaxFiveHourPercent() {
      if (!this.minimaxData) return 0;
      return Math.max(0, Math.min(100, 100 - (this.minimaxData.fiveHourPercent || 0)));
    },

    minimaxWeeklyPercent() {
      if (!this.minimaxData) return 0;
      return Math.max(0, Math.min(100, 100 - (this.minimaxData.weeklyPercent || 0)));
    },

    minimaxFiveHourText() {
      return `${this.minimaxFiveHourPercent}%`;
    },

    minimaxWeeklyText() {
      return `${this.minimaxWeeklyPercent}%`;
    }
  },

  mounted() {
    this.connect();
    this.startAgeTimer();
  },

  beforeUnmount() {
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
    }
  },

  methods: {
    // ==================== UI Actions ====================

    togglePin() {
      this.isPinned = !this.isPinned;
      if (this.isElectron) {
        window.electronAPI.toggleAlwaysOnTop(this.isPinned);
      }
    },

    minimize() {
      if (this.isElectron) {
        window.close();
      }
    },

    sendRefresh() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'refresh' }));
        this.isRefreshing = true;
        setTimeout(() => { this.isRefreshing = false; }, 1000);
      } else {
        console.warn('[WS] Not connected, cannot refresh');
      }
    },

    sendUsageRefresh() {
      this.sendRefresh();
      this.isUsageRefreshing = true;
      setTimeout(() => { this.isUsageRefreshing = false; }, 1000);
    },

    toggleCompact() {
      this.isCompact = !this.isCompact;
    },

    // ==================== Time Formatting ====================

    formatAge(ts) {
      if (!ts) return '—';
      const diff = this.now - new Date(ts).getTime();
      if (diff < 0) return 'just now';
      if (diff < 60 * 1000) return 'just now';
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
      if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    ageClass(ts) {
      if (!ts) return 'age-stale';
      const diff = this.now - new Date(ts).getTime();
      if (diff < 5 * 60 * 1000) return 'age-fresh';
      if (diff < 60 * 60 * 1000) return 'age-warn';
      return 'age-stale';
    },

    // ==================== Usage Monitor Helpers ====================

    isProviderDisabled(provider) {
      const state = this.usage[provider];
      if (!state) return true;
      const enabled = this.usage.enabled?.[provider];
      return enabled === false || state.error === 'disabled';
    },

    showUsageBars(provider) {
      const state = this.usage[provider];
      if (!state) return false;
      if (state.error === 'no_token' || state.error === 'disabled') return false;
      return true;
    },

    usageStatusText(provider) {
      const state = this.usage[provider];
      if (!state) return '—';
      if (state.error === 'disabled') return 'Disabled';
      if (state.error === 'no_token') return 'Not Configured';
      if (state.error) return 'Error';
      return 'OK';
    },

    usageStatusClass(provider) {
      const state = this.usage[provider];
      if (!state) return '';
      if (state.error === 'disabled') return 'disabled';
      if (state.error === 'no_token') return 'no_token';
      if (state.error) return 'error';
      return '';
    },

    kimiData(key) {
      return this.usage.kimi?.data?.[key] || null;
    },

    kimiText(key) {
      const d = this.kimiData(key);
      if (!d || !d.limit) return '—';
      return `${d.percent}%`;
    },

    kimiPercent(key) {
      const d = this.kimiData(key);
      if (!d || !d.limit) return 0;
      return Math.max(0, Math.min(100, d.used || 0));
    },

    barClass(percent) {
      if (percent > 80) return 'danger';
      if (percent > 50) return 'warn';
      return '';
    },

    formatResetTime(ts) {
      if (!ts) return '';
      let ms = Number(ts);
      if (isNaN(ms)) {
        const d = new Date(ts);
        const now = new Date();
        if (isNaN(d.getTime()) || d < now) return '';
        ms = d.getTime() - now.getTime();
      } 

      return `Reset in ${Math.ceil(ms / 60000)} min`;

    },

    // ==================== WebSocket ====================

    connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[WS] Connected');
          this.isConnected = true;
          this.reconnectDelay = 1000;
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('[WS] Message parse failed:', e);
          }
        };

        this.ws.onclose = () => {
          console.log('[WS] Connection closed');
          this.isConnected = false;
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.error('[WS] Error:', err);
          this.isConnected = false;
        };
      } catch (e) {
        console.error('[WS] Connection failed:', e);
        this.scheduleReconnect();
      }
    },

    scheduleReconnect() {
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        this.connect();
      }, this.reconnectDelay);
    },

    handleMessage(message) {
      if (message.type === 'init' && message.data) {
        if (message.data.claude && message.data.claude.details) {
          this.handleClaudeData(message.data.claude);
        }
        if (message.data.usage) {
          this.handleUsageInit(message.data.usage);
        }
      } else if (message.type === 'statusChange' && message.assistantId === 'claude' && message.data) {
        this.handleClaudeData(message.data);
      } else if (message.type === 'usageInit' && message.data) {
        this.handleUsageInit(message.data);
      } else if (message.type === 'usageUpdate' && message.provider) {
        this.handleUsageUpdate(message);
      }
    },

    handleClaudeData(claudeData) {
      if (!claudeData || !claudeData.details) return;
      this.projects = claudeData.details.projects || [];
      if (claudeData.lastUpdate) {
        this.lastUpdate = claudeData.lastUpdate;
      }
    },

    handleUsageInit(payload) {
      if (!payload) return;
      this.usage = {
        kimi: payload.kimi || null,
        minimax: payload.minimax || null,
        enabled: payload.enabled || {}
      };
    },

    handleUsageUpdate(payload) {
      if (!payload || !payload.provider) return;
      this.usage[payload.provider] = {
        ...this.usage[payload.provider],
        ...payload
      };
    },

    // ==================== Timers ====================

    startAgeTimer() {
      if (this.ageTimer) return;
      this.ageTimer = setInterval(() => {
        this.now = Date.now();
      }, 60000);
    },

    clearTimers() {
      if (this.ageTimer) {
        clearInterval(this.ageTimer);
        this.ageTimer = null;
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }
}).mount('#app');
