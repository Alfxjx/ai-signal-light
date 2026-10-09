import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deepMerge, patchConfig, readConfig, writeConfigAtomic, type Config } from './config-io';

function tmpFile(name = 'config.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'usage-cli-')), name);
}

describe('readConfig', () => {
  it('文件不存在时返回空配置且不算错误', () => {
    const r = readConfig(join(tmpdir(), 'definitely-missing-usage-cli.json'));
    expect(r).toEqual({ config: {}, error: null, existed: false });
  });

  it('JSON 损坏时返回中文错误而不是抛异常', () => {
    const p = tmpFile();
    writeFileSync(p, '{ not json', 'utf8');
    const r = readConfig(p);
    expect(r.error).toContain('不是合法 JSON');
    expect(r.existed).toBe(true);
  });

  it('顶层不是对象时报错（数组也不行）', () => {
    const p = tmpFile();
    writeFileSync(p, '[1,2,3]', 'utf8');
    expect(readConfig(p).error).toContain('顶层不是对象');
  });

  it('容忍 UTF-8 BOM', () => {
    const p = tmpFile();
    writeFileSync(p, '\uFEFF{"kimi":{"token":"x","enabled":true}}', 'utf8');
    expect(readConfig(p).config.kimi?.token).toBe('x');
  });
});

describe('deepMerge', () => {
  it('只覆盖 patch 里的键，未知的顶层字段原样保留', () => {
    const base = { thresholds: { warn: 50, danger: 80 }, window: { x: 1, y: 2 } };
    const out = deepMerge(base, { kimi: { token: 'x', enabled: true } });
    expect(out.window).toEqual({ x: 1, y: 2 });
    expect(out.thresholds).toEqual({ warn: 50, danger: 80 });
  });

  it('嵌套对象递归合并，不会丢掉同级的其他子键', () => {
    const base = { volcengine: { cookie: 'c', csrfToken: 't', accessKeyChanged: false } };
    const out = deepMerge(base, { volcengine: { accessKey: 'ak' } });
    // 只加 accessKey，其余三个字段必须还在
    expect(out.volcengine).toEqual({ cookie: 'c', csrfToken: 't', accessKeyChanged: false, accessKey: 'ak' });
  });

  it('标量与数组直接以 patch 为准，不做深度合并', () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('patch 里的 null 会覆盖掉原值（显式清空）', () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it('不改传入的 base（不产生副作用）', () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { c: 2 } });
    expect(base.a).toEqual({ b: 1 });
  });
});

describe('writeConfigAtomic', () => {
  it('父目录不存在时自动创建', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'usage-cli-')), 'deep', 'nested', 'config.json');
    writeConfigAtomic(p, { thresholds: { warn: 50, danger: 80 } });
    expect(existsSync(p)).toBe(true);
  });

  it('写完不留 .tmp 残留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-cli-'));
    writeConfigAtomic(join(dir, 'config.json'), {});
    expect(readdirSync(dir)).toEqual(['config.json']);
  });

  it('输出带缩进和末尾换行（人工可读 / 可 diff）', () => {
    const p = tmpFile();
    writeConfigAtomic(p, { kimi: { token: 'x', enabled: true } });
    const text = readFileSync(p, 'utf8');
    expect(text).toContain('\n  "kimi"');
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('patchConfig —— 与桌面程序共存的正确性', () => {
  it('只改目标 provider，桌面程序的专属字段一个都不丢', () => {
    const p = tmpFile();
    // 模拟一个真实的、由桌面程序写过的 config
    const desktopOwned = {
      window: { width: 380, height: 520, x: 100, y: 80, isCompact: false, dockedTop: false },
      floatingBall: { enabled: true, x: 1600, y: 900, isVisible: true },
      pet: { enabled: true, activePetId: 'codex', scale: 100, x: 10, y: 20, isVisible: true },
      lanMode: { enabled: true, apiKey: 'lan-secret' },
      intervalMinutes: 15,
      kimi: { token: 'old-kimi', enabled: true },
    };
    writeFileSync(p, JSON.stringify(desktopOwned), 'utf8');

    patchConfig(p, { deepseek: { token: 'sk-new', enabled: true } });

    const after = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    for (const key of ['window', 'floatingBall', 'pet', 'lanMode', 'intervalMinutes']) {
      expect(after[key]).toEqual((desktopOwned as Record<string, unknown>)[key]);
    }
    // 别人的 provider 也不能动
    expect((after.kimi as { token: string }).token).toBe('old-kimi');
    expect((after.deepseek as { token: string }).token).toBe('sk-new');
  });

  it('同一 provider 二次 patch 累加而不是覆盖', () => {
    const p = tmpFile();
    writeFileSync(p, JSON.stringify({ volcengine: { cookie: 'c1', csrfToken: 't1' } }), 'utf8');
    patchConfig(p, { volcengine: { accessKey: 'ak' } });
    patchConfig(p, { volcengine: { secretKey: 'sk' } });
    const after = JSON.parse(readFileSync(p, 'utf8')) as Config;
    expect(after.volcengine).toMatchObject({ cookie: 'c1', csrfToken: 't1', accessKey: 'ak', secretKey: 'sk' });
  });

  it('文件不存在时从空骨架开始写', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'usage-cli-')), 'sub', 'config.json');
    patchConfig(p, { kimi: { token: 'x', enabled: true } });
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ kimi: { token: 'x', enabled: true } });
  });

  it('JSON 损坏时抛错，绝不静默覆盖用户的文件', () => {
    const p = tmpFile();
    writeFileSync(p, '{ broken', 'utf8');
    expect(() => patchConfig(p, { kimi: { enabled: true } })).toThrow();
    // 关键：原文件还在，内容没被动过
    expect(readFileSync(p, 'utf8')).toBe('{ broken');
  });
});
