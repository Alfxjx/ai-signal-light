import { describe, it, expect } from 'vitest';
import { PROVIDERS, enabledProviders } from './index';

describe('PROVIDERS 注册表', () => {
  it('五家顺序固定：Kimi / MiniMax / 火山 / DeepSeek / MiMo', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['kimi', 'minimax', 'volcengine', 'deepseek', 'mimo']);
  });

  it('每家都有非空显示名，id 与 config.json 字段名一致', () => {
    for (const p of PROVIDERS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.fetch).toBe('function');
    }
  });
});

describe('enabledProviders', () => {
  it('只返回 enabled === true 的', () => {
    const result = enabledProviders({
      kimi: { enabled: true },
      minimax: { enabled: false },
      volcengine: { enabled: true },
      deepseek: { enabled: false },
      mimo: { enabled: true },
    });
    expect(result.map((p) => p.id)).toEqual(['kimi', 'volcengine', 'mimo']);
  });

  it('缺 enabled 字段视为未启用', () => {
    expect(enabledProviders({ kimi: { token: 'sk-x' } })).toEqual([]);
  });

  it('完全没有该家的配置时跳过，不抛错', () => {
    expect(enabledProviders({})).toEqual([]);
  });

  it('enabled 为真值但不是布尔 true（如字符串）时不启用', () => {
    const result = enabledProviders({
      kimi: { enabled: 'true' as unknown as boolean },
    });
    expect(result).toEqual([]);
  });

  it('已启用但没填凭据的那家仍然返回（由渲染层画成「未配置」）', () => {
    const result = enabledProviders({ mimo: { enabled: true, token: '' } });
    expect(result.map((p) => p.id)).toEqual(['mimo']);
  });
});
