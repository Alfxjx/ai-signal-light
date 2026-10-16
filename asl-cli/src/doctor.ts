import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configPath, loadConfig, type RawAppConfig } from 'providers-core';

export interface ProviderStatus {
  id: string;
  name: string;
  enabled: boolean;
  credential: string;
}

/** 各家凭据探测：token 型看 config 字段，火山看 AK/SK，Codex 看 ~/.codex/auth.json 是否存在 */
export function providerStatuses(config: RawAppConfig): ProviderStatus[] {
  const cred = (has: boolean): string => (has ? '已配置' : '未配置');
  return [
    { id: 'kimi', name: 'Kimi', enabled: config.kimi?.enabled === true, credential: cred(!!config.kimi?.token) },
    {
      id: 'minimax',
      name: 'MiniMax',
      enabled: config.minimax?.enabled === true,
      credential: cred(!!config.minimax?.token),
    },
    {
      id: 'volcengine',
      name: '火山',
      enabled: config.volcengine?.enabled === true,
      credential: cred(!!config.volcengine?.accessKey && !!config.volcengine?.secretKey),
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      enabled: config.deepseek?.enabled === true,
      credential: cred(!!config.deepseek?.token),
    },
    { id: 'mimo', name: 'MiMo', enabled: config.mimo?.enabled === true, credential: cred(!!config.mimo?.token) },
    {
      id: 'codex',
      name: 'Codex',
      enabled: config.codex?.enabled === true,
      credential: cred(existsSync(join(homedir(), '.codex', 'auth.json'))),
    },
  ];
}

export function renderDoctor(configFile: string = configPath()): string {
  const lines: string[] = [];
  const loaded = loadConfig(configFile);
  lines.push(`配置文件：${configFile}`);
  lines.push(`读取状态：${loaded.error ?? '正常'}`);
  lines.push('');
  for (const p of providerStatuses(loaded.config)) {
    lines.push(`${p.name.padEnd(8)}  ${p.enabled ? '已启用' : '未启用'}  ${p.credential}`);
  }
  return lines.join('\n');
}
