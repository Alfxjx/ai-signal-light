import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_THRESHOLDS, configPath, loadConfig, parseThresholds } from './config';

function writeConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'usage-cfg-'));
  const file = join(dir, 'config.json');
  writeFileSync(file, content, 'utf8');
  return file;
}

describe('loadConfig', () => {
  it('解析正常配置并取出阈值', () => {
    const file = writeConfig(JSON.stringify({
      kimi: { token: 'sk-kimi-x', enabled: true },
      thresholds: { warn: 40, danger: 90 },
    }));
    const loaded = loadConfig(file);
    expect(loaded.error).toBeNull();
    expect(loaded.config.kimi?.token).toBe('sk-kimi-x');
    expect(loaded.thresholds).toEqual({ warn: 40, danger: 90 });
  });

  it('容忍 UTF-8 BOM', () => {
    const file = writeConfig('\uFEFF' + JSON.stringify({ deepseek: { token: 'sk-y', enabled: true } }));
    const loaded = loadConfig(file);
    expect(loaded.error).toBeNull();
    expect(loaded.config.deepseek?.token).toBe('sk-y');
  });

  it('文件不存在时返回错误文案而不是抛出', () => {
    const loaded = loadConfig(join(tmpdir(), 'definitely-missing-config.json'));
    expect(loaded.error).toBe('config.json 读取失败');
    expect(loaded.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('JSON 损坏时返回错误文案而不是抛出', () => {
    const loaded = loadConfig(writeConfig('{ not json'));
    expect(loaded.error).toBe('config.json 解析失败');
  });

  it('顶层是数组时视为结构异常', () => {
    const loaded = loadConfig(writeConfig('[1,2,3]'));
    expect(loaded.error).toBe('config.json 结构异常');
  });

  it('缺 thresholds 时回落到默认值', () => {
    const loaded = loadConfig(writeConfig('{}'));
    expect(loaded.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe('configPath', () => {
  it('指向正式版 userData 的 config.json，而不是 -dev', () => {
    const path = configPath();
    expect(path.endsWith(join('AI状态监控', 'config.json'))).toBe(true);
    expect(path).not.toContain('-dev');
  });

  it('以 APPDATA 为根（Windows），不是用户家目录下的相对路径', () => {
    const appData = process.env.APPDATA;
    if (!appData) return; // 非 Windows 环境跳过
    expect(configPath().startsWith(appData.trim())).toBe(true);
  });
});

describe('parseThresholds', () => {
  it('非数字阈值回落默认值', () => {
    expect(parseThresholds({ thresholds: { warn: 'abc' as unknown as number } }))
      .toEqual({ warn: DEFAULT_THRESHOLDS.warn, danger: DEFAULT_THRESHOLDS.danger });
  });
});
