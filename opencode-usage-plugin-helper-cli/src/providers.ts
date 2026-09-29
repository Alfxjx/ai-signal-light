// 每家需要什么凭据、值从哪拿。
//
// 这份元数据是 doctor 能说出「缺什么」而不是只说「配错了」的关键，
// 也是 set 交互提示的依据。字段名必须和 ../opencode-plugin/src/config.ts 的
// RawProviderConfig / RawVolcengineConfig 完全一致 —— 类型层面由 satisfies 兜住。

import type { RawProviderConfig, RawVolcengineConfig } from './config-io.js';

export type ProviderId = 'kimi' | 'minimax' | 'volcengine' | 'deepseek' | 'mimo';

/** 字段名只允许是插件配置里真实存在的键 —— 写错一个字母就在编译期报出来 */
export type FieldKey = keyof RawProviderConfig | keyof RawVolcengineConfig;

export interface FieldSpec {
  /** config.json 里的字段名 */
  key: FieldKey;
  /** 终端提示里给用户看的中文名 */
  label: string;
  /** 值从哪拿 —— 这是用户最需要的信息 */
  source: string;
  /** 凭据是密钥类（掩码输入）还是普通文本 */
  secret: boolean;
}

/** 百分比型：单一 token 字段 */
interface SimpleProvider {
  id: ProviderId;
  name: string;
  fields: FieldSpec[];
}

function simple(id: ProviderId, name: string, key: FieldKey, label: string, source: string): SimpleProvider {
  return { id, name, fields: [{ key, label, source, secret: true }] };
}

const SIMPLE: SimpleProvider[] = [
  simple('kimi', 'Kimi', 'token', '开放平台 API key', 'Kimi 开放平台 → API Key，形如 sk-kimi-…'),
  simple('minimax', 'MiniMax', 'token', '开放平台 API key', 'MiniMax 开放平台 → API Key'),
  simple('deepseek', 'DeepSeek', 'token', '平台 API key', 'DeepSeek 开放平台 → API Key，形如 sk-…'),
  simple('mimo', 'MiMo', 'token', '控制台 Cookie', 'platform.xiaomimimimo.com 登录后复制整条 Cookie（调模型的 key 查不到余额）'),
];

/**
 * 火山**只走 AK/SK**，不提供 Cookie 通道。
 *
 * 插件本身也支持 cookie + csrfToken 兜底，但那条通道依赖控制台登录态，约一周就失效，
 * 而插件是只读的（故意不回写 cookie，避免和桌面程序互相覆盖），过期后只能报错。
 * 对「配一次就长期用」的场景来说，给一个必然过期的选项是给用户埋雷，所以这里不暴露它。
 */
const VOLCENGINE: SimpleProvider = {
  id: 'volcengine',
  name: '火山',
  fields: [
    { key: 'accessKey', label: 'Access Key', source: '火山控制台 → 访问控制 → 访问密钥 → 创建密钥对', secret: true },
    { key: 'secretKey', label: 'Secret Key', source: '与 Access Key 同一页签，创建时只显示一次', secret: true },
  ],
};

export const PROVIDERS: SimpleProvider[] = [...SIMPLE, VOLCENGINE];

/** 火山：两条都齐才算配齐 */
export function isVolcengineComplete(fields: Record<string, unknown>): boolean {
  return Boolean(str(fields.accessKey)) && Boolean(str(fields.secretKey));
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function findProvider(id: string): SimpleProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** 这一家还缺哪些字段。返回空数组 = 配齐了 */
export function missingFields(id: ProviderId, fields: Record<string, unknown>): FieldSpec[] {
  const spec = findProvider(id);
  if (!spec) return [];
  return spec.fields.filter((f) => !str(fields[f.key]));
}

/** 这一家是否「可用了」—— doctor 用来区分「没配」和「配了」 */
export function hasCredentials(id: ProviderId, fields: Record<string, unknown>): boolean {
  const spec = findProvider(id);
  if (!spec) return false;
  return spec.fields.every((f) => Boolean(str(fields[f.key])));
}

/** 丢掉空值与首尾空白。字段白名单由 spec 决定，多余的键不会被写进去 */
export function sanitizedFields(id: ProviderId, values: Record<string, string>): Record<string, string> {
  const spec = findProvider(id);
  if (!spec) return {};
  const out: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = (values[f.key] ?? '').trim();
    if (v) out[f.key] = v;
  }
  return out;
}
