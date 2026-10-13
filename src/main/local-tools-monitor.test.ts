import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  readActiveMarker,
  readOpenCodeService,
  parseCodexSession,
  findLatestFile,
  matchProcessNames,
  classifyCodexCwd,
  aggregateToolState,
  buildToolStatus,
} from './local-tools-monitor';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltm-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('readActiveMarker', () => {
  it('解析最新 active 标记', () => {
    const dir = tmpDir();
    write(path.join(dir, '100.json'), '{"pid":100,"startedAtMs":123}');
    write(path.join(dir, '200.json'), '{"pid":200,"startedAtMs":456}'); // 更新 mtime
    expect(readActiveMarker(dir)).toEqual({ pid: 200, startedAtMs: 456 });
  });

  it('坏 json / pid 缺失 → null', () => {
    const dir = tmpDir();
    write(path.join(dir, 'a.json'), 'not-json');
    expect(readActiveMarker(dir)).toBeNull();
    write(path.join(dir, 'b.json'), '{"startedAtMs":1}');
    expect(readActiveMarker(dir)).toBeNull();
  });

  it('目录不存在 / 空 → null', () => {
    expect(readActiveMarker(path.join(tmpDir(), 'nope'))).toBeNull();
    expect(readActiveMarker(tmpDir())).toBeNull();
  });
});

describe('readOpenCodeService', () => {
  it('解析 service.json', () => {
    const file = path.join(tmpDir(), 'service.json');
    write(file, '{"id":"x","version":"2.0.14","url":"http://127.0.0.1:49374","pid":37272}');
    expect(readOpenCodeService(file)).toEqual({ pid: 37272, version: '2.0.14', url: 'http://127.0.0.1:49374' });
  });

  it('缺文件 / pid 非数字 → null', () => {
    expect(readOpenCodeService(path.join(tmpDir(), 'nope.json'))).toBeNull();
    const file = path.join(tmpDir(), 'bad.json');
    write(file, '{"version":"1.0","pid":"abc"}');
    expect(readOpenCodeService(file)).toBeNull();
  });
});

describe('parseCodexSession', () => {
  it('取 session_meta.cwd + 尾部最后 timestamp', async () => {
    const dir = tmpDir();
    const f = path.join(dir, 'rollout-2026-10-13.jsonl');
    write(
      f,
      [
        '{"type":"session_meta","payload":{"id":"abc","cwd":"C:\\\\Users\\\\cari\\\\proj","timestamp":"2026-10-13T00:17:47.289Z"}}',
        '{"type":"event_msg","payload":{}}',
        '{"type":"response_item","payload":{"type":"message"}}',
        '{"type":"event_msg","payload":{},"timestamp":"2026-10-13T00:47:22.279Z"}',
      ].join('\n'),
    );
    const r = await parseCodexSession(f);
    expect(r?.cwd).toBe('C:\\Users\\cari\\proj');
    expect(r?.lastTsMs).toBe(Date.parse('2026-10-13T00:47:22.279Z'));
  });

  it('缺失文件 / 空文件 → null', async () => {
    expect(await parseCodexSession(path.join(tmpDir(), 'nope.jsonl'))).toBeNull();
    const empty = path.join(tmpDir(), 'empty.jsonl');
    write(empty, '');
    expect(await parseCodexSession(empty)).toBeNull();
  });

  it('尾部最后一行不完整时不误判', async () => {
    const dir = tmpDir();
    const f = path.join(dir, 'partial.jsonl');
    write(
      f,
      [
        '{"type":"session_meta","payload":{"cwd":"D:/code"},"timestamp":"2026-10-13T00:17:47Z"}',
        '{"type":"event_msg","timestamp":"2026-10-13T00:20:00Z"}',
        '{"type":"ev', // 写了一半的尾巴
      ].join('\n'),
    );
    const r = await parseCodexSession(f);
    expect(r?.cwd).toBe('D:/code');
    expect(r?.lastTsMs).toBe(Date.parse('2026-10-13T00:20:00Z'));
  });
});

describe('findLatestFile', () => {
  it('递归找最新文件并支持 ext 过滤', async () => {
    const root = tmpDir();
    write(path.join(root, 'a', 'x.jsonl'), '1');
    write(path.join(root, 'a', 'b', 'y.jsonl'), '2');
    write(path.join(root, 'z.txt'), '3'); // 更新 mtime
    const latest = await findLatestFile(root, { ext: ['.jsonl'] });
    expect(latest?.path.endsWith('y.jsonl')).toBe(true);
  });

  it('目录不存在 → null', async () => {
    expect(await findLatestFile(path.join(tmpDir(), 'nope'))).toBeNull();
  });
});

describe('matchProcessNames', () => {
  it('命中 / 大小写不敏感 / 未命中', () => {
    const lines = ['"Codex.exe","56100","Console","1","83,040 K"', '"ChatGPT.exe","55716","Console","1","328,656 K"'];
    expect(matchProcessNames(lines, ['codex.exe', 'chatgpt.exe'])).toBe(true);
    expect(matchProcessNames(lines, ['node.exe'])).toBe(false);
    expect(matchProcessNames([], ['codex.exe'])).toBe(false);
  });
});

describe('classifyCodexCwd', () => {
  it('桌面版 / CLI / null', () => {
    expect(classifyCodexCwd('C:\\Users\\cari\\Documents\\Codex\\2026-10-13\\ni')).toBe('desktop');
    expect(classifyCodexCwd('D:\\codes\\moco\\cari.product.license.management')).toBe('cli');
    expect(classifyCodexCwd(null)).toBeNull();
  });
});

describe('aggregateToolState', () => {
  const t = (state: 'working' | 'idle' | 'offline'): { state: 'working' | 'idle' | 'offline' } => ({ state });

  it('working 优先于 idle', () => {
    expect(aggregateToolState({ codex: t('idle'), mcode: t('working'), opencode: t('offline') } as never)).toBe('working');
  });
  it('idle 优先于 offline', () => {
    expect(aggregateToolState({ codex: t('idle'), mcode: t('offline'), opencode: t('offline') } as never)).toBe('idle');
  });
  it('全 offline', () => {
    expect(aggregateToolState({ codex: t('offline'), mcode: t('offline'), opencode: t('offline') } as never)).toBe('offline');
  });
});

describe('buildToolStatus', () => {
  it('running + 最近活跃 → working', () => {
    expect(buildToolStatus(true, Date.now() - 5_000, Date.now(), 60_000)).toMatchObject({ running: true, state: 'working' });
  });
  it('running + 超窗 → idle', () => {
    expect(buildToolStatus(true, Date.now() - 120_000, Date.now(), 60_000)).toMatchObject({ running: true, state: 'idle' });
  });
  it('未运行 → offline（lastActive 保留）', () => {
    expect(buildToolStatus(false, Date.now() - 3_600_000, Date.now(), 60_000)).toMatchObject({
      running: false,
      state: 'offline',
      lastActive: expect.any(Number),
    });
  });
});
