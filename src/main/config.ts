/**
 * 配置存储
 * 持久化用户设置到 userData/config.json
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { AppConfig, ConfigPartial, HooksEnabledConfig } from '../shared/types/config';

const DEFAULTS: AppConfig = {
  kimi:    { token: '', enabled: true, useProxy: false },
  minimax: { token: '', enabled: true, useProxy: false },
  copilot: { token: '', enabled: true, useProxy: false },
  proxy: { url: '' },
  intervalMinutes: 10,
  window: { width: 240, height: 550, x: null, y: null, isCompact: true },
  hooks: {
    enabled: { Notification: true, Stop: true, PreToolUse: true },
    endpoint: { autoInstalled: false }
  }
};

export const VALID_INTERVALS = [5, 10, 15, 30, 60] as const;
export type ValidInterval = typeof VALID_INTERVALS[number];

export const HOOK_EVENTS = ['Notification', 'Stop', 'PreToolUse'] as const;
export type HookEvent = typeof HOOK_EVENTS[number];

export class ConfigStore {
  private userDataDir: string;
  private configPath: string;
  private tmpPath: string;
  private callbacks: ((cfg: AppConfig) => void)[] = [];
  private data: AppConfig;

  constructor() {
    this.userDataDir = app.getPath('userData');
    this.configPath = path.join(this.userDataDir, 'config.json');
    this.tmpPath = this.configPath + '.tmp';
    this.data = this._load();
  }

  // 同步加载配置（启动时调用）
  private _load(): AppConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        return JSON.parse(JSON.stringify(DEFAULTS)) as AppConfig;
      }
      const raw = fs.readFileSync(this.configPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      return {
        kimi:    { ...DEFAULTS.kimi,    ...(parsed.kimi    || {}) },
        minimax: { ...DEFAULTS.minimax, ...(parsed.minimax || {}) },
        copilot: { ...DEFAULTS.copilot, ...(parsed.copilot || {}) },
        proxy:   { ...DEFAULTS.proxy,   ...(parsed.proxy   || {}) },
        window:  { ...DEFAULTS.window,  ...(parsed.window  || {}) },
        hooks: {
          enabled:  { ...DEFAULTS.hooks.enabled,  ...((parsed.hooks && parsed.hooks.enabled)  || {}) },
          endpoint: { ...DEFAULTS.hooks.endpoint, ...((parsed.hooks && parsed.hooks.endpoint) || {}) }
        },
        intervalMinutes: VALID_INTERVALS.includes(parsed.intervalMinutes as ValidInterval)
          ? (parsed.intervalMinutes as ValidInterval)
          : DEFAULTS.intervalMinutes
      };
    } catch (e) {
      console.warn('[Config] load failed, using defaults:', (e as Error).message);
      return JSON.parse(JSON.stringify(DEFAULTS)) as AppConfig;
    }
  }

  // 获取完整配置（深拷贝，防止外部修改内部状态）
  get(): AppConfig {
    return JSON.parse(JSON.stringify(this.data)) as AppConfig;
  }

  // 更新配置（浅合并），同步写文件 + 触发 onChange
  update(partial: ConfigPartial): void {
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
    if (partial.window && typeof partial.window === 'object') {
      this.data.window = { ...this.data.window, ...partial.window };
    }
    if (partial.hooks && typeof partial.hooks === 'object') {
      if (partial.hooks.enabled && typeof partial.hooks.enabled === 'object') {
        const next = { ...this.data.hooks.enabled };
        for (const ev of HOOK_EVENTS) {
          if (typeof partial.hooks.enabled[ev] === 'boolean') {
            next[ev as keyof HooksEnabledConfig] = partial.hooks.enabled[ev] as boolean;
          }
        }
        this.data.hooks.enabled = next;
      }
      if (partial.hooks.endpoint && typeof partial.hooks.endpoint === 'object') {
        if (typeof partial.hooks.endpoint.autoInstalled === 'boolean') {
          this.data.hooks.endpoint.autoInstalled = partial.hooks.endpoint.autoInstalled;
        }
      }
    }
    if (typeof partial.intervalMinutes === 'number'
        && VALID_INTERVALS.includes(partial.intervalMinutes as ValidInterval)) {
      this.data.intervalMinutes = partial.intervalMinutes as ValidInterval;
    }

    this._save();
    this._emit();
  }

  // 订阅配置变更
  onChange(cb: (cfg: AppConfig) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  // 原子写入：先写 .tmp 再 rename
  private _save(): void {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }
      fs.writeFileSync(this.tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(this.tmpPath, this.configPath);
    } catch (e) {
      console.error('[Config] save failed:', (e as Error).message);
    }
  }

  private _emit(): void {
    const snapshot = this.get();
    this.callbacks.forEach(cb => {
      try { cb(snapshot); } catch (e) {
        console.error('[Config] onChange callback error:', e);
      }
    });
  }
}
