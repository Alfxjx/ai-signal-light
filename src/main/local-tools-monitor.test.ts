import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  readActiveMarker,
  readOpenCodeService,
  parseCodexSession,
  codexEventToPhase,
  openCodeBasicAuth,
  extractOpenCodeSessions,
  parseOpenCodeSession,
  parseMcodeSqliteOutput,
  mcodeStatusToPhase,
  mergeProjects,
  aggregateProjectPhase,
  findRecentFiles,
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
  it('解析 service.json（含 password）', () => {
    const file = path.join(tmpDir(), 'service.json');
    write(file, '{"id":"x","version":"2.0.14","url":"http://127.0.0.1:49374","pid":37272,"password":"sekret"}');
    expect(readOpenCodeService(file)).toEqual({
      pid: 37272,
      version: '2.0.14',
      url: 'http://127.0.0.1:49374',
      password: 'sekret',
    });
  });

  it('缺文件 / pid 非数字 → null', () => {
    expect(readOpenCodeService(path.join(tmpDir(), 'nope.json'))).toBeNull();
    const file = path.join(tmpDir(), 'bad.json');
    write(file, '{"version":"1.0","pid":"abc"}');
    expect(readOpenCodeService(file)).toBeNull();
  });
});

describe('parseCodexSession', () => {
  it('取 session_meta.cwd + 尾部最后事件与 timestamp', async () => {
    const dir = tmpDir();
    const f = path.join(dir, 'rollout-2026-10-13.jsonl');
    write(
      f,
      [
        '{"type":"session_meta","payload":{"id":"abc","cwd":"C:\\\\Users\\\\cari\\\\proj","timestamp":"2026-10-13T00:17:47.289Z"}}',
        '{"type":"event_msg","payload":{}}',
        '{"type":"response_item","payload":{"type":"message"}}',
        '{"type":"response_item","payload":{"type":"reasoning"},"timestamp":"2026-10-13T00:47:22.279Z"}',
      ].join('\n'),
    );
    const r = await parseCodexSession(f);
    expect(r?.cwd).toBe('C:\\Users\\cari\\proj');
    expect(r?.lastTsMs).toBe(Date.parse('2026-10-13T00:47:22.279Z'));
    expect(r?.lastEvent).toEqual({ type: 'response_item', payloadType: 'reasoning' });
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
    expect(r?.lastEvent?.type).toBe('event_msg');
  });
});

describe('codexEventToPhase', () => {
  it('reasoning → thinking', () => {
    expect(codexEventToPhase({ type: 'response_item', payloadType: 'reasoning' })).toBe('thinking');
  });
  it('function_call / custom_tool_call → editing', () => {
    expect(codexEventToPhase({ type: 'response_item', payloadType: 'function_call' })).toBe('editing');
    expect(codexEventToPhase({ type: 'response_item', payloadType: 'custom_tool_call' })).toBe('editing');
  });
  it('assistant message → editing，user message → idle', () => {
    expect(codexEventToPhase({ type: 'response_item', payloadType: 'message', role: 'assistant' })).toBe('editing');
    expect(codexEventToPhase({ type: 'response_item', payloadType: 'message', role: 'user' })).toBe('idle');
  });
  it('event_msg（token_count/task_complete）→ idle', () => {
    expect(codexEventToPhase({ type: 'event_msg', payloadType: 'token_count' })).toBe('idle');
    expect(codexEventToPhase({ type: 'event_msg', payloadType: 'task_complete' })).toBe('idle');
    expect(codexEventToPhase(null)).toBe('idle');
  });
});

describe('openCodeBasicAuth', () => {
  it('生成 opencode:<password> 的 Basic header', () => {
    const expected = `Basic ${Buffer.from('opencode:sekret').toString('base64')}`;
    expect(openCodeBasicAuth('sekret')).toBe(expected);
  });
});

describe('extractOpenCodeSessions', () => {
  it('支持裸数组 / {data} / {sessions} 三种形状', () => {
    expect(extractOpenCodeSessions([{ id: 'a' }])).toHaveLength(1);
    expect(extractOpenCodeSessions({ data: [{ id: 'a' }] })).toHaveLength(1);
    expect(extractOpenCodeSessions({ sessions: [{ id: 'a' }] })).toHaveLength(1);
    expect(extractOpenCodeSessions({ foo: 1 })).toHaveLength(0);
    expect(extractOpenCodeSessions(null)).toHaveLength(0);
  });
});

describe('parseOpenCodeSession', () => {
  const now = Date.parse('2026-10-13T09:00:00Z');

  it('解析 cwd / title（剥 thinking 标签）/ phase', () => {
    const s = {
      id: 'ses_x',
      title: '<thinking>Greeting response',
      location: { directory: 'D:\\me\\clash-verge-rev' },
      time: { updated: now - 10_000, idle: now - 10_000 },
    };
    const r = parseOpenCodeSession(s, now, 60_000);
    expect(r).toEqual({
      cwd: 'D:\\me\\clash-verge-rev',
      title: 'Greeting response',
      phase: 'thinking',
      updatedMs: now - 10_000,
    });
  });

  it('标题无标签但刚更新 → editing', () => {
    const r = parseOpenCodeSession(
      { title: 'hello world', time: { updated: now - 5_000 } },
      now,
      60_000,
    );
    expect(r?.phase).toBe('editing');
  });

  it('无标签 + 旧更新 → idle；非法对象 → null', () => {
    const r2 = parseOpenCodeSession({ title: '任务完成', time: { updated: now - 120_000 } }, now, 60_000);
    expect(r2?.phase).toBe('idle');
    expect(parseOpenCodeSession(null, now, 60_000)).toBeNull();
  });
});

describe('parseMcodeSqliteOutput / mcodeStatusToPhase', () => {
  it('解析外部 node 输出（多行）', () => {
    const out = JSON.stringify([
      { session_id: 'a', status: 'idle', title: '打招呼', workspace_dir: 'D:\\me\\proj', updated_at_ms: 111 },
      { session_id: 'b', status: 'working', title: '干活的', workspace_dir: 'D:\\me\\proj2', updated_at_ms: 222 },
    ]);
    const rows = parseMcodeSqliteOutput(out);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ status: 'idle', title: '打招呼', workspaceDir: 'D:\\me\\proj', updatedAtMs: 111 });
    expect(rows[1].status).toBe('working');
  });
  it('空数组 / 坏输出 → []', () => {
    expect(parseMcodeSqliteOutput('[]')).toEqual([]);
    expect(parseMcodeSqliteOutput('not-json')).toEqual([]);
  });
  it('status → phase 映射', () => {
    expect(mcodeStatusToPhase('idle')).toBe('idle');
    expect(mcodeStatusToPhase('working')).toBe('editing');
    expect(mcodeStatusToPhase(null)).toBe('idle');
  });
});

describe('mergeProjects / aggregateProjectPhase', () => {
  it('同 cwd 归并：忙态取更忙、时间取最新、标题取非空', () => {
    const projects = mergeProjects([
      { cwd: 'D:\\me\\proj', title: null, phase: 'idle', lastActive: 100 },
      { cwd: 'D:\\me\\proj', title: '标题', phase: 'thinking', lastActive: 200 },
      { cwd: 'D:\\other', title: '别的', phase: 'editing', lastActive: 300 },
    ]);
    const proj = projects.find((p) => p.name === 'proj');
    expect(proj?.phase).toBe('thinking');
    expect(proj?.lastActive).toBe(200);
    expect(proj?.title).toBe('标题');
    expect(projects).toHaveLength(2);
    // 按 lastActive 倒序
    expect(projects[0].name).toBe('other');
  });

  it('无 cwd 以 title 归并', () => {
    const projects = mergeProjects([
      { cwd: null, title: '任务A', phase: 'idle', lastActive: 1 },
      { cwd: null, title: '任务A', phase: 'editing', lastActive: 2 },
    ]);
    expect(projects).toHaveLength(1);
    expect(projects[0].phase).toBe('editing');
  });

  it('aggregateProjectPhase 优先级 thinking > editing > idle', () => {
    expect(aggregateProjectPhase([
      { id: 'a', name: 'a', cwd: null, title: null, phase: 'idle', lastActive: null },
      { id: 'b', name: 'b', cwd: null, title: null, phase: 'editing', lastActive: null },
    ])).toBe('editing');
    expect(aggregateProjectPhase([
      { id: 'a', name: 'a', cwd: null, title: null, phase: 'editing', lastActive: null },
      { id: 'b', name: 'b', cwd: null, title: null, phase: 'thinking', lastActive: null },
    ])).toBe('thinking');
    expect(aggregateProjectPhase([])).toBe('idle');
  });
});

describe('findRecentFiles', () => {
  it('按 mtime 倒序返回最新 N 个并支持 ext 过滤', async () => {
    const root = tmpDir();
    write(path.join(root, 'a', 'x.jsonl'), '1');
    write(path.join(root, 'a', 'b', 'y.jsonl'), '2');
    write(path.join(root, 'z.txt'), '3'); // 最新 mtime
    write(path.join(root, 'w.jsonl'), '4'); // 再新
    const list = await findRecentFiles(root, { ext: ['.jsonl'], limit: 2 });
    expect(list).toHaveLength(2);
    expect(list[0].path.endsWith('w.jsonl')).toBe(true);
  });

  it('目录不存在 → []', async () => {
    expect(await findRecentFiles(path.join(tmpDir(), 'nope'))).toEqual([]);
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
  const proj = (phase: 'thinking' | 'editing' | 'idle' | 'offline', lastActive: number | null) => ({
    id: 'x',
    name: 'x',
    cwd: null,
    title: null,
    phase,
    lastActive,
  });

  it('running + thinking 项目 → working / thinking', () => {
    expect(buildToolStatus(true, [proj('thinking', 1)])).toMatchObject({ running: true, state: 'working', phase: 'thinking' });
  });
  it('running + 全 idle → idle；lastActive 取最大', () => {
    const s = buildToolStatus(true, [proj('idle', 100), proj('idle', 200)]);
    expect(s).toMatchObject({ state: 'idle', phase: 'idle', lastActive: 200 });
  });
  it('未运行 → offline（projects 保留）', () => {
    const s = buildToolStatus(false, [proj('idle', 100)]);
    expect(s).toMatchObject({ running: false, state: 'offline', phase: 'offline', lastActive: 100 });
    expect(s.projects).toHaveLength(1);
  });
});
