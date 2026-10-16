import { describe, it, expect } from 'vitest';
import { mapMimoBalance } from './mimo';

describe('mapMimoBalance', () => {
  it('解析 data 信封内的总额/赠送/付费', () => {
    const json = {
      code: 0,
      data: { currency: 'CNY', totalBalance: '21.66', grantedBalance: '1.66', paidBalance: '20.00' },
    };
    expect(mapMimoBalance(json)).toEqual({ currency: 'CNY', total: 21.66 });
  });

  it('兼容 snake_case 字段名与嵌套 balance 对象', () => {
    const r = mapMimoBalance({ data: { balance: { total_balance: '30.5', granted_balance: '0.5' } } });
    expect(r.total).toBe(30.5);
    expect(r.currency).toBe('CNY');
  });

  it('balance 为嵌套对象且字段是短名时也能取到总额', () => {
    expect(mapMimoBalance({ balance: { total: 12.34, paid: 12.34, granted: 0 } }).total).toBe(12.34);
  });

  it('带 scale 倍率字段时换算金额单位', () => {
    expect(mapMimoBalance({ data: { scale: 100, totalBalance: 2166 } }).total).toBe(21.66);
  });

  it('只有总额为 0 时仍能解析出 0', () => {
    expect(mapMimoBalance({ data: { totalBalance: 0 } }).total).toBe(0);
  });

  it('找不到任何余额字段时抛错', () => {
    expect(() => mapMimoBalance({ data: { foo: 1 } })).toThrow('余额');
  });
});
