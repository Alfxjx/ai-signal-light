import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { relativeStubTarget, repoPluginDir, stubContent } from './paths';

describe('repoPluginDir 在 src 与 dist 两种布局下都要找对', () => {
  it('解析出的目录确实含插件入口', () => {
    // 本测试跑在 src/ 下；dist/ 下由真机 smoke 覆盖
    expect(existsSync(join(repoPluginDir(), 'src', 'tui.tsx'))).toBe(true);
  });

  it('返回的是绝对路径', () => {
    expect(isAbsolute(repoPluginDir())).toBe(true);
  });
});

describe('relativeStubTarget', () => {
  it('算出 POSIX 风格的相对路径', () => {
    // /a/b/c → /a/b/d/e/tui.tsx：公共前缀 /a/b，回退一级
    expect(relativeStubTarget('/a/b/c', '/a/b/d/e/tui.tsx')).toBe('../d/e/tui.tsx');
  });

  it('同一目录树内也强制加 ./ 前缀（ESM 相对导入必须显式）', () => {
    const out = relativeStubTarget('/a/b', '/a/b/tui.tsx');
    expect(out).toBe('./tui.tsx');
  });

  it('分隔符统一成正斜杠，Windows 上生成的转发文件才能被 Bun 解析', () => {
    const from = join('C:', 'Users', 'x', '.config', 'opencode', 'plugins', 'usage-sidebar');
    const to = join('D:', 'dev', 'repo', 'opencode-plugin', 'src', 'tui.tsx');
    const out = relativeStubTarget(from, to);
    expect(out).not.toContain('\\');
  });

  it('跨盘符时 relative() 退化成绝对路径，但不会抛错', () => {
    const out = relativeStubTarget(join('C:', 'a'), join('D:', 'b', 'tui.tsx'));
    // 退化结果不是相对路径，这正是 README 里「绝对路径换机器会失效」警告的情形
    expect(out.length).toBeGreaterThan(0);
  });

  it('目标在父目录时正确给出 ..', () => {
    expect(relativeStubTarget('/a/b/c/d', '/a/x.ts')).toBe('../../../x.ts');
  });

  it('resolve 归一化后与手算一致', () => {
    const from = resolve('/a', 'b', 'c');
    const to = resolve('/a', 'b', 'tui.tsx');
    expect(relativeStubTarget(from, to)).toBe('../tui.tsx');
    expect(sep).toBeDefined();
  });
});

describe('stubContent', () => {
  it('生成 README 里记录的那种单行 re-export', () => {
    // /a/plugins/usage-sidebar → /a/repo/... ：公共前缀 /a，回退两级
    const out = stubContent('/a/plugins/usage-sidebar', '/a/repo/opencode-plugin/src/tui.tsx');
    expect(out).toBe("export { default } from '../../repo/opencode-plugin/src/tui.tsx';\n");
  });

  it('一定以换行结尾（文本文件规范）', () => {
    expect(stubContent('/a', '/a/t.tsx').endsWith('\n')).toBe(true);
  });
});
