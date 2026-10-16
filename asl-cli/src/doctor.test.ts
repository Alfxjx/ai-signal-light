import { describe, expect, it } from 'vitest';
import { providerStatuses } from './doctor.js';
import type { RawAppConfig } from 'providers-core';

describe('providerStatuses', () => {
  it('逐家报告 enabled 与凭据状态', () => {
    const config: RawAppConfig = {
      kimi: { enabled: true, token: 'sk-x' },
      volcengine: { enabled: true, accessKey: 'AK', secretKey: 'SK' },
      codex: { enabled: true },
    };
    const list = providerStatuses(config);
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get('kimi')).toMatchObject({ enabled: true, credential: '已配置' });
    expect(byId.get('volcengine')).toMatchObject({ enabled: true, credential: '已配置' });
    expect(byId.get('codex')!.credential).toMatch(/^已?配置$/); // 读真实 ~/.codex/auth.json 存在性，不做假设
    expect(byId.get('minimax')).toMatchObject({ enabled: false, credential: '未配置' });
    expect(list).toHaveLength(6);
  });
});
