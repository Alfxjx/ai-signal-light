import { describe, it, expect } from 'vitest';
import { unzip, parseInput, parsePetdexScript } from './pet-install';

function u16(v: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v, 0);
  return b;
}

function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
}

function localFileHeader(name: string, method: number, compressedSize: number, uncompressedSize: number, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  return Buffer.concat([
    u32(0x04034b50),
    u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(0), u32(compressedSize), u32(uncompressedSize),
    u16(nameBuf.length), u16(0),
    nameBuf,
    data,
  ]);
}

function centralDirectoryHeader(name: string, method: number, compressedSize: number, uncompressedSize: number, offset: number): Buffer {
  const nameBuf = Buffer.from(name, 'utf-8');
  return Buffer.concat([
    u32(0x02014b50),
    u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
    u32(0), u32(compressedSize), u32(uncompressedSize),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
    u32(0), u32(offset),
    nameBuf,
  ]);
}

function eocd(cdOffset: number, cdSize: number, totalRecords: number): Buffer {
  return Buffer.concat([
    u32(0x06054b50),
    u16(0), u16(0),
    u16(totalRecords), u16(totalRecords),
    u32(cdSize), u32(cdOffset),
    u16(0),
  ]);
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function deflateRaw(data: Buffer): Promise<Buffer> {
  const ds = new CompressionStream('deflate-raw');
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds);
  return Buffer.from(new Uint8Array(await new Response(stream).arrayBuffer()));
}

interface ZipEntry { name: string; method: number; data: string }

async function makeZip(entries: ZipEntry[]): Promise<Buffer> {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;
  for (const { name, method, data } of entries) {
    const raw = Buffer.from(data);
    let compressed = raw;
    if (method === 8) {
      compressed = Buffer.from(await deflateRaw(raw));
    }
    const lfh = localFileHeader(name, method, compressed.length, raw.length, compressed);
    localParts.push(lfh);
    cdParts.push(centralDirectoryHeader(name, method, compressed.length, raw.length, offset));
    offset += lfh.length;
  }
  const local = Buffer.concat(localParts);
  const cd = Buffer.concat(cdParts);
  return Buffer.concat([local, cd, eocd(local.length, cd.length, entries.length)]);
}

describe('unzip', () => {
  it('正常解析 store 与 deflate 条目，并按 basename 匹配', async () => {
    const zip = await makeZip([
      { name: 'pets/my-pet/pet.json', method: 8, data: '{"id":"test"}' },
      { name: 'pets/my-pet/spritesheet.webp', method: 0, data: 'RIFF....WEBP' },
    ]);
    const files = await unzip(toArrayBuffer(zip));
    expect(files.size).toBe(2);
    expect(files.has('pets/my-pet/pet.json')).toBe(true);
    expect(files.has('pets/my-pet/spritesheet.webp')).toBe(true);
    expect(Buffer.from(files.get('pets/my-pet/pet.json') as Uint8Array).toString()).toBe('{"id":"test"}');
  });

  it('拒绝路径中含有 .. 的条目', async () => {
    const zip = await makeZip([
      { name: '../etc/passwd', method: 0, data: 'evil' },
      { name: 'pet.json', method: 0, data: '{}' },
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/不合法/);
  });

  it('拒绝绝对路径条目', async () => {
    const zip = await makeZip([
      { name: '/etc/passwd', method: 0, data: 'evil' },
      { name: 'pet.json', method: 0, data: '{}' },
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/不合法/);
  });

  it('拒绝含空字节的路径', async () => {
    const zip = await makeZip([
      { name: 'pet\0.json', method: 0, data: 'evil' },
      { name: 'pet.json', method: 0, data: '{}' },
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/不合法/);
  });

  it('单文件解压大小超出上限时报错', async () => {
    const big = Buffer.alloc(17 * 1024 * 1024, 'a');
    const zip = await makeZip([{ name: 'big.txt', method: 0, data: big.toString() }]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/单文件/);
  });

  it('总解压大小超出上限时报错', async () => {
    const part = Buffer.alloc(12 * 1024 * 1024, 'a');
    const zip = await makeZip([
      { name: 'a.txt', method: 0, data: part.toString() },
      { name: 'b.txt', method: 0, data: part.toString() },
      { name: 'c.txt', method: 0, data: part.toString() },
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/总解压/);
  });

  it('store 方式 compressed/uncompressed size 不一致时报错', async () => {
    const nameBuf = Buffer.from('bad.txt', 'utf-8');
    const zip = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(5), u32(10),
      u16(nameBuf.length), u16(0),
      nameBuf,
      Buffer.from('hello'),
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/不一致/);
  });

  it('deflate 解压长度与 header 声明不一致时报错', async () => {
    const name = 'bad.txt';
    const nameBuf = Buffer.from(name, 'utf-8');
    const compressed = Buffer.from(await deflateRaw(Buffer.from('hello')));
    const zip = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(0), u32(compressed.length), u32(1000),
      u16(nameBuf.length), u16(0),
      nameBuf,
      compressed,
    ]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/解压长度/);
  });

  it('central directory 与 local header 不一致时报错', async () => {
    const name = 'pet.json';
    const nameBuf = Buffer.from(name, 'utf-8');
    const data = Buffer.from('{}');
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(data.length), u32(data.length),
      u16(nameBuf.length), u16(0),
      nameBuf,
      data,
    ]);
    const cd = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(data.length), u32(999),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(0),
      nameBuf,
    ]);
    const zip = Buffer.concat([local, cd, eocd(local.length, cd.length, 1)]);
    await expect(unzip(toArrayBuffer(zip))).rejects.toThrow(/central directory/);
  });
});

describe('parseInput', () => {
  it('识别 petdex 安装命令', () => {
    expect(parseInput('curl -sSf https://petdex.dev/install/sasuke-uchiha | sh'))
      .toEqual({ kind: 'petdex', url: 'https://petdex.dev/install/sasuke-uchiha' });
  });

  it('识别裸 petdex 安装 URL', () => {
    expect(parseInput('https://petdex.dev/install/sasuke-uchiha'))
      .toEqual({ kind: 'petdex', url: 'https://petdex.dev/install/sasuke-uchiha' });
  });

  it('codex-pets.net 与 slug 格式不受影响', () => {
    expect(parseInput('curl -L "https://codex-pets.net/api/pets/abc/download?v=1" -o x.zip').kind).toBe('zip');
    expect(parseInput('tanjiro-kamado--wangfan002').kind).toBe('slug');
  });
});

const PETDEX_SCRIPT = `#!/bin/sh
set -e
PET_DIR="$HOME/.codex/pets/sasuke-uchiha"
curl -fsSL -e "https://petdex.dev/" -o "$PET_DIR/pet.json" 'https://assets.petdex.dev/pets/sasuke-uchiha-1f598b965f64/petjson.json'
curl -fsSL -e "https://petdex.dev/" -o "$PET_DIR/spritesheet.webp" 'https://assets.petdex.dev/pets/sasuke-uchiha-1f598b965f64/sprite.webp'
`;

describe('parsePetdexScript', () => {
  it('从安装脚本提取素材地址', () => {
    const { petJsonUrl, spriteUrl } = parsePetdexScript(PETDEX_SCRIPT);
    expect(petJsonUrl).toBe('https://assets.petdex.dev/pets/sasuke-uchiha-1f598b965f64/petjson.json');
    expect(spriteUrl).toBe('https://assets.petdex.dev/pets/sasuke-uchiha-1f598b965f64/sprite.webp');
  });

  it('缺少素材地址时报错', () => {
    expect(() => parsePetdexScript('#!/bin/sh\necho hello\n')).toThrow(/素材地址/);
    expect(() => parsePetdexScript('')).toThrow(/素材地址/);
  });
});
