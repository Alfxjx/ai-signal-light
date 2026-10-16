import { describe, it, expect } from 'vitest';
import { mapMiniMax } from './minimax';

const json = {
  base_resp: { status_code: 0, status_msg: 'success' },
  model_remains: [
    { model_name: 'other', current_interval_remaining_percent: 90 },
    {
      model_name: 'general',
      current_interval_remaining_percent: 52,
      current_weekly_remaining_percent: 38,
      remains_time: 7200000,
      weekly_remains_time: 259200000,
    },
  ],
};

describe('mapMiniMax', () => {
  it('只取 general 档，并把「剩余 %」翻成「已用 %」', () => {
    expect(mapMiniMax(json)).toEqual({
      fiveHour: { label: '5h', percent: 48, resetTime: '7200000' },
      weekly: { label: '周', percent: 62, resetTime: '259200000' },
    });
  });

  it('status_code 非 0 时抛错', () => {
    expect(() => mapMiniMax({ base_resp: { status_code: 1001, status_msg: 'boom' } })).toThrow('boom');
  });

  it('找不到 general 档时抛错', () => {
    expect(() => mapMiniMax({ base_resp: { status_code: 0 }, model_remains: [] })).toThrow('general');
  });

  it('缺字段容错为 100% 已用（即剩余 0）', () => {
    const r = mapMiniMax({ base_resp: { status_code: 0 }, model_remains: [{ model_name: 'general' }] });
    expect(r.fiveHour.percent).toBe(100);
    expect(r.fiveHour.resetTime).toBeNull();
  });
});
