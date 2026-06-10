/**
 * 配置存储
 * 持久化用户设置到 userData/config.json
 * 无外部依赖，使用 fs 原生 API
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  kimi:    { token: '', enabled: true, useProxy: false },
  minimax: { token: '', enabled: true, useProxy: false },
  copilot: { token: '', enabled: true, useProxy: false },
  proxy: { url: '' },
  intervalMinutes: 10
};

const VALID_INTERVALS = [5, 10, 15, 30, 60];

class ConfigStore {
  constructor() {
    this.userDataDir = app.getPath('userData');
    this.configPath = path.join(this.userDataDir, 'config.json');
    this.tmpPath = this.configPath + '.tmp';
    this.callbacks = [];
    this.data = this._load();
  }

  // 同步加载配置（启动时调用）
  _load() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return JSON.parse(JSON.stringify(DEFAULTS));
      }
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      // 合并默认值，防止用户配置文件缺字段
      return {
        kimi:    { ...DEFAULTS.kimi,    ...(parsed.kimi    || {}) },
        minimax: { ...DEFAULTS.minimax, ...(parsed.minimax || {}) },
        copilot: { ...DEFAULTS.copilot, ...(parsed.copilot || {}) },
        proxy:   { ...DEFAULTS.proxy,   ...(parsed.proxy   || {}) },
        intervalMinutes: VALID_INTERVALS.includes(parsed.intervalMinutes)
          ? parsed.intervalMinutes
          : DEFAULTS.intervalMinutes
      };
    } catch (e) {
      console.warn('[Config] load failed, using defaults:', e.message);
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  // 获取完整配置（深拷贝，防止外部修改内部状态）
  get() {
    return JSON.parse(JSON.stringify(this.data));
  }

  // 更新配置（浅合并），同步写文件 + 触发 onChange
  update(partial) {
    if (!partial || typeof partial !== 'object') return;

    if (partial.kimi && typeof partial.kimi === 'object') {
      this.data.kimi = { ...this.data.kimi, ...partial.kimi };
    }
    if (partial.minimax && typeof partial.minimax === 'object') {
      this.data.minimax = { ...this.data.minimax, ...partial.minimax };
    }
    if (partial.copilot && typeof partial.copilot === 'object') {
      this.data.copilot = { ...this.data.copilot, ...partial.copilot };
    }
    if (partial.proxy && typeof partial.proxy === 'object') {
      this.data.proxy = { ...this.data.proxy, ...partial.proxy };
    }
    if (typeof partial.intervalMinutes === 'number'
        && VALID_INTERVALS.includes(partial.intervalMinutes)) {
      this.data.intervalMinutes = partial.intervalMinutes;
    }

    this._save();
    this._emit();
  }

  // 订阅配置变更
  onChange(cb) {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  // 原子写入：先写 .tmp 再 rename
  _save() {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }
      fs.writeFileSync(this.tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(this.tmpPath, this.configPath);
    } catch (e) {
      console.error('[Config] save failed:', e.message);
    }
  }

  _emit() {
    const snapshot = this.get();
    this.callbacks.forEach(cb => {
      try { cb(snapshot); } catch (e) {
        console.error('[Config] onChange callback error:', e);
      }
    });
  }
}

module.exports = { ConfigStore, VALID_INTERVALS };
