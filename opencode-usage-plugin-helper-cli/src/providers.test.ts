import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  findProvider,
  hasCredentials,
  missingFields,
  sanitizedFields,
  isVolcengineComplete,
  type FieldKey,
} from './providers';

describe('PROVIDERS 元数据自洽', () => {
  it('五家都在，且 id 不重复', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['kimi', 'minimax', 'deepseek', 'mimo', 'volcengine']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每家至少有一个字段，且字段名合法（类型已保证，运行时再兜一层）', () => {
    const legal: FieldKey[] = ['token', 'accessKey', 'secretKey', 'cookie', 'csrfToken', 'enabled', 'useProxy', 'accessKeyChanged', 'secretKeyChanged'];
    for (const p of PROVIDERS) {
      expect(p.fields.length).toBeGreaterThan(0);
      for (const f of p.fields) {
        expect(legal).toContain(f.key);
        expect(f.label.length).toBeGreaterThan(0);
        // source 是用户唯一能照着做事的指引，不能空
        expect(f.source.length).toBeGreaterThan(0);
      }
    }
  });

  it('简单四家都只有一个 token 字段（这样 --token 才能用）', () => {
    for (const id of ['kimi', 'minimax', 'deepseek', 'mimo'] as const) {
      expect(findProvider(id)?.fields).toHaveLength(1);
    }
  });

  it('火山的凭据字段多于一个，--token 不该被接受', () => {
    expect(findProvider('volcengine')!.fields.length).toBeGreaterThan(1);
  });

  it('火山只暴露 AK/SK，不提供必然过期的 cookie 通道', () => {
    const keys = findProvider('volcengine')!.fields.map((f) => f.key);
    expect(keys).toEqual(['accessKey', 'secretKey']);
    expect(keys).not.toContain('cookie');
    expect(keys).not.toContain('csrfToken');
  });
});

describe('hasCredentials / missingFields', () => {
  it('单字段 provider：有值才算配齐', () => {
    expect(hasCredentials('kimi', {})).toBe(false);
    expect(hasCredentials('kimi', { token: '  ' })).toBe(false); // 空白不算
    expect(hasCredentials('kimi', { token: 'sk-x' })).toBe(true);
  });

  it('missingFields 精确指出缺哪个', () => {
    expect(missingFields('kimi', {}).map((f) => f.key)).toEqual(['token']);
    expect(missingFields('kimi', { token: 'x' })).toEqual([]);
  });

  it('enabled:false 不影响凭据判定（两者是独立的轴）', () => {
    expect(hasCredentials('kimi', { token: 'x', enabled: false })).toBe(true);
  });
});

describe('火山只认 AK/SK', () => {
  it('两条都齐 → 配齐', () => {
    expect(isVolcengineComplete({ accessKey: 'ak', secretKey: 'sk' })).toBe(true);
  });

  it('只给一条 → 不算配齐', () => {
    expect(isVolcengineComplete({ accessKey: 'ak' })).toBe(false);
    expect(isVolcengineComplete({ secretKey: 'sk' })).toBe(false);
  });

  it('空白值不算配齐', () => {
    expect(isVolcengineComplete({ accessKey: 'ak', secretKey: '   ' })).toBe(false);
  });

  it('cookie / csrfToken 单独出现不再算配齐（该通道已下线）', () => {
    expect(isVolcengineComplete({ cookie: 'c', csrfToken: 't' })).toBe(false);
  });

  it('missingFields 精确指出缺哪条', () => {
    expect(missingFields('volcengine', {}).map((f) => f.key)).toEqual(['accessKey', 'secretKey']);
    expect(missingFields('volcengine', { accessKey: 'ak' }).map((f) => f.key)).toEqual(['secretKey']);
    expect(missingFields('volcengine', { accessKey: 'ak', secretKey: 'sk' })).toEqual([]);
  });
});

describe('sanitizedFields', () => {
  it('丢掉空值与首尾空白', () => {
    expect(sanitizedFields('kimi', { token: '  sk-x  ' })).toEqual({ token: 'sk-x' });
    expect(sanitizedFields('kimi', { token: '   ' })).toEqual({});
  });

  it('不在白名单里的键不会被写进 config.json', () => {
    // 即便调用方多塞了字段，也只写 spec 里声明过的
    expect(sanitizedFields('kimi', { token: 'x', cookie: 'nope' })).toEqual({ token: 'x' });
  });

  it('火山只写 AK/SK 两项', () => {
    expect(sanitizedFields('volcengine', { accessKey: 'ak', secretKey: 'sk' })).toEqual({
      accessKey: 'ak',
      secretKey: 'sk',
    });
  });

  it('不认识的 provider 返回空对象而不是抛错', () => {
    // @ts-expect-error 故意传非法 id，验证运行时也稳
    expect(sanitizedFields('nope', { token: 'x' })).toEqual({});
  });
});
