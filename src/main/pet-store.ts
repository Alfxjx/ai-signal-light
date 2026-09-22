/**
 * 桌面宠物素材库：主进程磁盘存储。
 *
 * 每只宠物一条 `<id>.json`（完整记录含 base64 图集 dataUrl + 元信息），原子写。
 * 与渲染层（Settings 窗口）的分工：渲染层负责下载/解析/校验图集（浏览器 API），
 * 拿到 dataUrl 后经 IPC `pet:install` 交给这里持久化，并设为活动宠物。
 */

import fs from 'fs';
import path from 'path';
import type { PetInstallInput, PetMeta, PetRecord } from '../shared/types/ipc';

function makeId(): string {
  return `pet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PetStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch {
      // 目录创建失败由后续读写暴露
    }
  }

  private file(id: string): string {
    // 只允许合法 id 落到目录内，防路径注入
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`非法宠物 id: ${id}`);
    return path.join(this.dir, `${id}.json`);
  }

  /** 列出全部宠物元信息（不含图集本体，按安装时间正序） */
  list(): PetMeta[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    const metas: PetMeta[] = [];
    for (const name of names) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')) as PetRecord;
        metas.push({ id: rec.id, name: rec.name, author: rec.author, source: rec.source, addedAt: rec.addedAt });
      } catch {
        // 跳过坏文件
      }
    }
    return metas.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
  }

  /** 取完整记录（含 dataUrl 图集） */
  get(id: string): PetRecord | null {
    try {
      const raw = fs.readFileSync(this.file(id), 'utf8');
      const rec = JSON.parse(raw) as PetRecord;
      if (typeof rec.dataUrl !== 'string' || !rec.dataUrl) return null;
      return rec;
    } catch {
      return null;
    }
  }

  /** 安装一只新宠物，返回新记录元信息 */
  add(input: PetInstallInput): PetMeta {
    if (!input || typeof input.dataUrl !== 'string' || !input.dataUrl) {
      throw new Error('素材为空');
    }
    const record: PetRecord = {
      id: makeId(),
      name: input.name || '未命名',
      author: input.author || '',
      source: input.source || '',
      dataUrl: input.dataUrl,
      addedAt: Date.now(),
    };
    this.writeRecord(record);
    return this.toMeta(record);
  }

  /** 删除一只宠物（非法 id 直接忽略，防路径注入） */
  remove(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
    const file = this.file(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private writeRecord(record: PetRecord): void {
    const file = this.file(record.id);
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(record), 'utf8');
      fs.renameSync(tmp, file);
    } catch (e) {
      throw new Error(`宠物素材保存失败: ${(e as Error).message}`);
    }
  }

  private toMeta(rec: PetRecord): PetMeta {
    return { id: rec.id, name: rec.name, author: rec.author, source: rec.source, addedAt: rec.addedAt };
  }
}
