import { describe, it, expect, afterEach } from 'vitest';
import { normalizeCwd } from './cwd';

describe('normalizeCwd', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it('returns null for null/undefined', () => {
    expect(normalizeCwd(null)).toBeNull();
    expect(normalizeCwd(undefined)).toBeNull();
    expect(normalizeCwd('')).toBeNull();
  });

  it('lowercases on Windows', () => {
    globalThis.window = { electronAPI: { platform: 'win32' } } as unknown as Window & typeof globalThis;
    expect(normalizeCwd('C:\\Users\\Test')).toBe('c:\\users\\test');
  });

  it('preserves case on macOS', () => {
    globalThis.window = { electronAPI: { platform: 'darwin' } } as unknown as Window & typeof globalThis;
    expect(normalizeCwd('/Users/Test')).toBe('/Users/Test');
  });

  it('preserves case on Linux', () => {
    globalThis.window = { electronAPI: { platform: 'linux' } } as unknown as Window & typeof globalThis;
    expect(normalizeCwd('/home/Test')).toBe('/home/Test');
  });
});
