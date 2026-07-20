import { describe, it, expect } from 'vitest';
import { isCopilotOAuthToken, mapCopilotUserResponse } from './copilot-auth';

describe('isCopilotOAuthToken', () => {
  it('gho_/ghu_ 前缀识别为 OAuth token', () => {
    expect(isCopilotOAuthToken('gho_abcdef')).toBe(true);
    expect(isCopilotOAuthToken('ghu_abcdef')).toBe(true);
  });
  it('Cookie 串/空串不是 OAuth token', () => {
    expect(isCopilotOAuthToken('_octo=abc; logged_in=yes')).toBe(false);
    expect(isCopilotOAuthToken('')).toBe(false);
  });
});

describe('mapCopilotUserResponse', () => {
  it('映射 quota_snapshots 为 CopilotUsageData（percent 为已用 %）', () => {
    const json = {
      copilot_plan: 'individual_pro',
      access_type_sku: 'copilot_for_individuals',
      quota_reset_date: '2026-08-01',
      quota_reset_date_utc: '2026-08-01T00:00:00Z',
      quota_snapshots: {
        premium_interactions: { entitlement: 300, remaining: 120, percent_remaining: 40, unlimited: false },
        chat: { entitlement: 1000, remaining: 250, percent_remaining: 25, unlimited: false },
      },
    };
    expect(mapCopilotUserResponse(json)).toEqual({
      premium: {
        limit: 300,
        remaining: 120,
        percent: 60, // (300-120)/300
        resetDate: '2026-08-01',
        resetDateUtc: '2026-08-01T00:00:00Z',
      },
      chat: { percent: 75 }, // 100 - 25
      plan: 'individual_pro',
      licenseType: 'copilot_for_individuals',
    });
  });
  it('entitlement 为 0 时 percent 为 0', () => {
    const json = { quota_snapshots: { premium_interactions: { entitlement: 0, remaining: 0 } } };
    const r = mapCopilotUserResponse(json);
    expect(r.premium.percent).toBe(0);
  });
  it('缺字段时容错为 null/0', () => {
    const r = mapCopilotUserResponse({});
    expect(r.plan).toBeNull();
    expect(r.chat.percent).toBe(0);
    expect(r.premium.resetDate).toBeNull();
  });
});
