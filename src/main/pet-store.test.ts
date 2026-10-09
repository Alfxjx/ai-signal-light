import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PetStore } from './pet-store';

describe('PetStore', () => {
  let dir: string;
  let store: PetStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-store-test-'));
    store = new PetStore(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('add 后能 get/list，元信息不含图集本体', () => {
    const meta = store.add({ name: '测试宠物', author: '作者', source: 'test', dataUrl: 'data:image/webp;base64,AAA' });
    expect(meta.id).toMatch(/^pet-/);
    expect(meta.name).toBe('测试宠物');
    const rec = store.get(meta.id);
    expect(rec?.dataUrl).toBe('data:image/webp;base64,AAA');
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('dataUrl');
  });

  it('按安装时间正序', () => {
    store.add({ name: 'a', author: '', source: '', dataUrl: '1' });
    store.add({ name: 'b', author: '', source: '', dataUrl: '2' });
    expect(store.list().map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('remove 后消失', () => {
    const meta = store.add({ name: 'a', author: '', source: '', dataUrl: '1' });
    store.remove(meta.id);
    expect(store.get(meta.id)).toBeNull();
    expect(store.list()).toHaveLength(0);
  });

  it('拒绝空素材；非法 id 安全忽略（防路径注入）', () => {
    expect(() => store.add({ name: '', author: '', source: '', dataUrl: '' })).toThrow(/素材为空/);
    expect(store.get('../evil')).toBeNull();
    expect(() => store.remove('../evil')).not.toThrow();
  });

  it('坏文件在 list 中被跳过', () => {
    fs.writeFileSync(path.join(dir, 'broken.json'), 'not-json', 'utf8');
    const meta = store.add({ name: 'ok', author: '', source: '', dataUrl: '1' });
    expect(store.list().map((p) => p.id)).toEqual([meta.id]);
  });
});
