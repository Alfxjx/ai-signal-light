// 只读解析桌面应用（AI状态监控）的 config.json。
// 契约来源：src/shared/types/config.ts，但插件不 import 它（独立 npm 包）。
// 本文件绝不写回文件 —— cookie / CSRF 的续期回写由桌面应用独占，避免互相踩踏。

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface RawProviderConfig {
  token?: string;
  enabled?: boolean;
  useProxy?: boolean;
}

export interface RawVolcengineConfig {
  accessKey?: string;
  secretKey?: string;
  cookie?: string;
  csrfToken?: string;
  enabled?: boolean;
}

export interface RawAppConfig {
  kimi?: RawProviderConfig;
  minimax?: RawProviderConfig;
  deepseek?: RawProviderConfig;
  mimo?: RawProviderConfig;
  volcengine?: RawVolcengineConfig;
  thresholds?: { warn?: number; danger?: number };
}

export interface Thresholds {
  warn: number;
  danger: number;
}

export interface LoadedConfig {
  config: RawAppConfig;
  thresholds: Thresholds;
  /** null 表示读取成功；否则是可直接渲染的中文文案 */
  error: string | null;
}

export const DEFAULT_THRESHOLDS: Thresholds = { warn: 50, danger: 80 };

/** %APPDATA%\AI状态监控\config.json（正式版 userData，只读） */
export function configPath(): string {
  const appData = process.env.APPDATA?.trim()
    ? process.env.APPDATA.trim()
    : join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'AI状态监控', 'config.json');
}

export function parseThresholds(raw: RawAppConfig): Thresholds {
  const warn = Number(raw.thresholds?.warn);
  const danger = Number(raw.thresholds?.danger);
  return {
    warn: Number.isFinite(warn) ? warn : DEFAULT_THRESHOLDS.warn,
    danger: Number.isFinite(danger) ? danger : DEFAULT_THRESHOLDS.danger,
  };
}

export function loadConfig(path: string = configPath()): LoadedConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 读取失败' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 解析失败' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: {}, thresholds: { ...DEFAULT_THRESHOLDS }, error: 'config.json 结构异常' };
  }

  const config = parsed as RawAppConfig;
  return { config, thresholds: parseThresholds(config), error: null };
}
