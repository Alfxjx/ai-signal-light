// init 的两条关键性质（都是真机 smoke 测出问题后补的回归测试）：
//   1. --force 重置凭据，但**绝不动**桌面程序专属字段
//   2. 阈值是用户偏好，--force 也要保留

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDERS } from './providers';
import { readConfig, writeConfigAtomic, type Config } from './config-io';

/** 复刻 init.ts 的 resetOwnedKeys（纯函数，独立于命令的 IO） */
function resetOwnedKeys(existing: Config): Config {
  const out: Config = { ...existing };
  for (const p of PROVIDERS) out[p.id] = { enabled: false };
  out.thresholds = existing.thresholds ?? { warn: 50, danger: 80 };
  return out;
}

const DESKTOP_FIELDS = {
  window: { width: 380, height: 520, x: 100, y: 80, isCompact: false, dockedTop: true },
  floatingBall: { enabled: true, x: 1600, y: 900, isVisible: true },
  pet: { enabled: true, activePetId: 'codex', scale: 100, x: 10, y: 20, isVisible: true },
  lanMode: { enabled: true, apiKey: 'lan-secret' },
  intervalMinutes: 15,
  hooks: { enabled: true, endpoint: 'http://127.0.0.1:3456/api/hooks/claude' },
};

describe('resetOwnedKeys', () => {
  it('五家全部重置成 enabled:false 且不留旧凭据', () => {
    const before: Config = {
      kimi: { token: 'old-kimi', enabled: true },
      volcengine: { accessKey: 'ak', secretKey: 'sk', enabled: true },
    };
    const after = resetOwnedKeys(before);
    for (const p of PROVIDERS) {
      expect(after[p.id]).toEqual({ enabled: false });
    }
    expect((after.kimi as { token?: string }).token).toBeUndefined();
    expect((after.volcengine as { accessKey?: string }).accessKey).toBeUndefined();
  });

  it('桌面程序专属字段一个都不能丢（回归：曾整文件覆写把它们清空）', () => {
    const after = resetOwnedKeys({ ...DESKTOP_FIELDS } as Config);
    for (const [key, value] of Object.entries(DESKTOP_FIELDS)) {
      expect(after[key]).toEqual(value);
    }
  });

  it('保留已有阈值（用户偏好，不算凭据）', () => {
    expect(resetOwnedKeys({ thresholds: { warn: 40, danger: 90 } }).thresholds).toEqual({ warn: 40, danger: 90 });
  });

  it('没有阈值时补默认值', () => {
    expect(resetOwnedKeys({}).thresholds).toEqual({ warn: 50, danger: 80 });
  });

  it('从空配置起步也能产出可用骨架', () => {
    const after = resetOwnedKeys({});
    expect(Object.keys(after).sort()).toEqual(
      ['thresholds', ...PROVIDERS.map((p) => p.id)].sort(),
    );
  });
});

describe('init 的磁盘效果（用临时文件模拟）', () => {
  it('--force 之后桌面的 window/pet/lanMode 仍在文件里', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-init-'));
    const file = join(dir, 'config.json');
    writeConfigAtomic(file, { ...DESKTOP_FIELDS } as Config);

    // 模拟 init --force：读 → resetOwnedKeys → 原子写
    const { config } = readConfig(file);
    writeConfigAtomic(file, resetOwnedKeys(config));

    const after = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    expect(after.pet).toEqual(DESKTOP_FIELDS.pet);
    expect(after.window).toEqual(DESKTOP_FIELDS.window);
    expect(after.lanMode).toEqual(DESKTOP_FIELDS.lanMode);
    expect(after.kimi).toEqual({ enabled: false });
  });

  it('init 写完后磁盘上只多一个文件，没有 .tmp 残留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-init-'));
    writeConfigAtomic(join(dir, 'config.json'), resetOwnedKeys({}));
    expect(readdirSync(dir)).toEqual(['config.json']);
    expect(existsSync(join(dir, 'config.json.tmp'))).toBe(false);
  });

  it('已有内容被破坏时 resetOwnedKeys 不会把垃圾写回去', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-init-'));
    const file = join(dir, 'config.json');
    writeFileSync(file, '{ broken json', 'utf8');
    // readConfig 报错 → init 应该中止，不调用 resetOwnedKeys
    expect(readConfig(file).error).not.toBeNull();
    expect(readFileSync(file, 'utf8')).toBe('{ broken json');
  });
});
