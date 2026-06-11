import { describe, it, expect } from 'vitest';
import { formatAge, ageClass, barClass, formatResetTime } from './time';

describe('formatAge', () => {
  const now = new Date('2026-06-11T12:00:00Z').getTime();

  it('returns — for null', () => {
    expect(formatAge(null, now)).toBe('—');
  });

  it('returns just now for recent', () => {
    expect(formatAge(now - 30000, now)).toBe('just now');
  });

  it('returns minutes ago', () => {
    expect(formatAge(now - 5 * 60 * 1000, now)).toBe('5m ago');
  });

  it('returns hours ago', () => {
    expect(formatAge(now - 3 * 60 * 60 * 1000, now)).toBe('3h ago');
  });

  it('returns date for older', () => {
    const ts = '2026-06-10T08:30:00Z';
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(formatAge(ts, now)).toBe(expected);
  });
});

describe('ageClass', () => {
  const now = Date.now();

  it('returns age-fresh for < 5min', () => {
    expect(ageClass(now - 3 * 60 * 1000, now)).toBe('age-fresh');
  });

  it('returns age-warn for < 1h', () => {
    expect(ageClass(now - 30 * 60 * 1000, now)).toBe('age-warn');
  });

  it('returns age-stale for old', () => {
    expect(ageClass(now - 2 * 60 * 60 * 1000, now)).toBe('age-stale');
  });

  it('returns age-stale for null', () => {
    expect(ageClass(null, now)).toBe('age-stale');
  });
});

describe('barClass', () => {
  it('returns empty for <= 50%', () => {
    expect(barClass(40)).toBe('');
  });

  it('returns warn for 50-80%', () => {
    expect(barClass(60)).toBe('warn');
    expect(barClass(75)).toBe('warn');
  });

  it('returns danger for > 80%', () => {
    expect(barClass(90)).toBe('danger');
  });
});

describe('formatResetTime', () => {
  it('returns empty for null', () => {
    expect(formatResetTime(null)).toBe('');
  });

  it('formats remaining ms', () => {
    expect(formatResetTime(30 * 60 * 1000)).toBe('Reset in 30 min');
  });

  it('returns empty for past date', () => {
    expect(formatResetTime('2020-01-01T00:00:00Z')).toBe('');
  });
});
