/**
 * Settings Window Logic - Vue 3
 * 加载当前配置 → 编辑 → 保存
 */

const { createApp } = Vue;

createApp({
  data() {
    return {
      kimi: {
        enabled: false,
        token: '',
        tokenChanged: false,
        hasToken: false,
        showToken: false
      },
      minimax: {
        enabled: false,
        token: '',
        tokenChanged: false,
        hasToken: false,
        showToken: false
      },
      intervalMinutes: 10,
      saving: false
    };
  },

  async mounted() {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }

    const cfg = await window.electronAPI.getSettings();
    if (cfg) {
      this.kimi.enabled = !!cfg.kimi.enabled;
      this.kimi.token = cfg.hasKimiToken ? (cfg.kimi.token || '') : '';
      this.kimi.hasToken = !!cfg.hasKimiToken;

      this.minimax.enabled = !!cfg.minimax.enabled;
      this.minimax.token = cfg.hasMiniMaxToken ? (cfg.minimax.token || '') : '';
      this.minimax.hasToken = !!cfg.hasMiniMaxToken;

      this.intervalMinutes = cfg.intervalMinutes || 10;
    }
  },

  methods: {
    async onSave() {
      if (!window.electronAPI) return;

      this.saving = true;
      try {
        await window.electronAPI.saveSettings({
          kimi: {
            token: this.kimi.token.trim(),
            tokenChanged: this.kimi.tokenChanged,
            enabled: this.kimi.enabled
          },
          minimax: {
            token: this.minimax.token.trim(),
            tokenChanged: this.minimax.tokenChanged,
            enabled: this.minimax.enabled
          },
          intervalMinutes: this.intervalMinutes
        });
        this.onCancel();
      } catch (e) {
        console.error('save failed:', e);
        alert('保存失败: ' + e.message);
        this.saving = false;
      }
    },

    onCancel() {
      if (window.electronAPI) {
        window.electronAPI.closeSettings();
      } else {
        window.close();
      }
    }
  }
}).mount('#app');
