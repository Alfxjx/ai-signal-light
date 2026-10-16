import chalk from 'chalk';
import { beforeEach, describe, expect, it } from 'vitest';
import { bar, renderUsage } from './render.js';
import type { ProviderState } from 'providers-core';

const NOW = Date.parse('2026-10-16T12:00:00.000Z');
const THRESHOLDS = { warn: 50, danger: 80 };

const OK: ProviderState = {
  id: 'kimi',
  name: 'Kimi',
  windows: [
    { label: '5h', percent: 52, resetTime: '2026-10-16T15:12:00.000Z' },
    { label: '周', percent: 23, resetTime: null },
  ],
  balance: null,
  error: null,
  lastUpdated: null,
};
const BALANCE: ProviderState = {
  id: 'deepseek',
  name: 'DeepSeek',
  windows: [],
  balance: { currency: 'USD', total: 12.34 },
  error: null,
  lastUpdated: null,
};
const ERR: ProviderState = {
  id: 'codex',
  name: 'Codex',
  windows: [],
  balance: null,
  error: 'no_token',
  lastUpdated: null,
};

describe('bar', () => {
  it('按百分比填充', () => {
    expect(bar(50, 10)).toBe('█████░░░░░');
    expect(bar(0, 10)).toBe('░░░░░░░░░░');
    expect(bar(100, 10)).toBe('██████████');
  });
  it('clamp 到 0-100', () => {
    expect(bar(150, 10)).toBe('██████████');
    expect(bar(-5, 10)).toBe('░░░░░░░░░░');
  });
});

describe('renderUsage', () => {
  beforeEach(() => {
    chalk.level = 0;
  });

  it('头部带 config 路径', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('AI 状态监控 CLI');
    expect(out).toContain('C:/cfg.json');
  });

  it('首个窗口带名称列，后续窗口缩进；带倒计时', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('Kimi');
    expect(out).toContain('52%');
    expect(out).toContain('23%');
    expect(out).toContain('3h 后重置');
  });

  it('余额型渲染余额', () => {
    const out = renderUsage([BALANCE], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('$12.34');
  });

  it('错误行灰显文案（no_token → 未配置）', () => {
    const out = renderUsage([ERR], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).toContain('未配置');
  });

  it('color:true 时阈值上色（warn → 黄）', () => {
    chalk.level = 3; // vitest 非 tty 下 chalk 自动降为 0，须手动开
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW, color: true });
    expect(out).toContain('\u001B[33m');
  });

  it('默认 color:false 无 ANSI', () => {
    const out = renderUsage([OK], { configPath: 'C:/cfg.json', thresholds: THRESHOLDS, now: NOW });
    expect(out).not.toContain('\u001B[');
  });
});
