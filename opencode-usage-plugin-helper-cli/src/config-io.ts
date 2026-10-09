// config.json 的读写。
//
// 两条硬约束（都是因为这个文件和桌面程序共用）：
//   1. **原子写**：先写 .tmp 再 rename。桌面程序可能同时在读，半个 JSON 会让它解析失败。
//   2. **深合并，绝不整文件覆写**：config.json 里有 window / pet / floatingBall / lanMode
//      等一堆桌面程序专属字段。CLI 只认识 5 个 provider 节点 + thresholds，
//      如果整文件重写就会把这些字段全清空 —— 用户的窗口位置和宠物设置直接没了。

import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * config.json 的形状，必须与 ../opencode-plugin/src/config.ts 的 RawAppConfig 一致。
 * 这里是本地副本（原因同 paths.ts 的 configPath）；防漂移靠 config-io.test.ts 的对照测试。
 *
 * 只声明 CLI 会碰的部分 —— 其余桌面程序专属字段（window / pet / lanMode …）
 * 本来就该被原样保留，不需要在类型里出现。
 */
export interface RawProviderConfig {
  token?: string;
  enabled?: boolean;
  useProxy?: boolean;
}

export interface RawVolcengineConfig {
  accessKey?: string;
  secretKey?: string;
  enabled?: boolean;
  useProxy?: boolean;
}

export interface RawAppConfig {
  kimi?: RawProviderConfig;
  minimax?: RawProviderConfig;
  deepseek?: RawProviderConfig;
  mimo?: RawProviderConfig;
  volcengine?: RawVolcengineConfig;
  thresholds?: { warn?: number; danger?: number };
  [key: string]: unknown;
}

export type Config = RawAppConfig;

export interface ReadResult {
  config: Config;
  /** null 表示成功；否则是可直接展示的中文错误 */
  error: string | null;
  existed: boolean;
}

export function readConfig(path: string): ReadResult {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { config: {}, error: null, existed: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { config: {}, error: 'config.json 不是合法 JSON（可能被手工改坏了）', existed: true };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: {}, error: 'config.json 顶层不是对象', existed: true };
  }
  return { config: parsed as Config, error: null, existed: true };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 把 patch 深合并进 base，返回新对象（不改入参）。
 * 只有两边都是「普通对象」时才递归；数组和标量直接以 patch 为准。
 */
export function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value)
      ? deepMerge(current, value)
      : value;
  }
  return out as T;
}

/** 原子写：同目录 .tmp → rename。rename 在同一文件系统内是原子的。 */
export function writeConfigAtomic(path: string, config: Config): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    renameSync(tmp, path);
  } catch (error) {
    // 失败时别把 tmp 留在用户目录里
    try {
      unlinkSync(tmp);
    } catch {
      /* 已经不在了就算了 */
    }
    throw error;
  }
}

/**
 * 读 → 深合并 → 原子写。只动 patch 里出现的 key。
 * 这是 CLI 唯一允许的写入口，保证不会误伤桌面程序的字段。
 * 文件不存在时从空骨架开始（等同于 init）。
 */
export function patchConfig(path: string, patch: Record<string, unknown>): void {
  const { config, error } = readConfig(path);
  if (error) throw new Error(error);
  // RawAppConfig 是精确类型（没有索引签名），深合并按「任意 JSON 对象」处理，
  // 这里过一道 cast；写入的形状由 providers.ts 的 FieldKey 类型保证。
  writeConfigAtomic(path, deepMerge(config as Record<string, unknown>, patch));
}
