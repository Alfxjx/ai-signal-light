// set：写入某家的凭据。

import { configPath } from '../paths.js';
import { readConfig, patchConfig } from '../config-io.js';
import { findProvider, hasCredentials, missingFields, sanitizedFields, type ProviderId } from '../providers.js';
import { ask, askSecret, isInteractive, confirm } from '../prompt.js';
import { bold, error, info, step, success, warn, dim } from '../ui.js';

export async function set(id: string, token: string | undefined): Promise<number> {
  const spec = findProvider(id);
  if (!spec) {
    error(`未知 provider：${id}`);
    info(`  可用：kimi  minimax  volcengine  deepseek  mimo`);
    return 1;
  }
  const providerId = id as ProviderId;
  const path = configPath();
  const { config, error: readErr, existed } = readConfig(path);
  if (readErr) {
    error(`${readErr}：${path}`);
    return 1;
  }
  if (!existed) {
    warn(`配置还不存在：${path}`);
    step('先跑 init 生成骨架');
    return 1;
  }

  // findProvider 已确认 id 合法；RawAppConfig 没有索引签名，这里过一道 cast
  const current = (config as Record<string, unknown>)[id] as Record<string, unknown> | undefined ?? {};
  const missing = missingFields(providerId, current);

  info('');
  info(bold(`${spec.name}（${spec.id}）`));
  if (!missing.length) {
    step('已配置完整，下面可以覆盖更新（留空保留原值）');
  }

  const values: Record<string, string> = {};

  // --token 是给脚本 / CI 用的，绕过掩码输入
  if (token !== undefined) {
    if (spec.fields.length !== 1) {
      error(`${spec.name} 需要多个字段（${spec.fields.map((f) => f.key).join(', ')}），--token 不适用`);
      info(`  ${spec.name} 只能用交互式输入（密钥不适合放进命令行历史）：`);
      info(`  usage-helper set ${id}`);
      return 1;
    }
    values[spec.fields[0]!.key] = token;
  } else {
    if (!isInteractive()) {
      error('当前不是交互式终端，无法掩码输入');
      // 只有单字段的 provider 才有 --token 这条退路，多字段的没有
      if (spec.fields.length === 1) {
        info(`  可以用 --token 非交互写入：usage-helper set ${id} --token <值>`);
      } else {
        info(`  ${spec.name} 有 ${spec.fields.length} 个字段（${spec.fields.map((f) => f.key).join(', ')}），没有非交互入口`);
        info(`  请在真实终端里跑：usage-helper set ${id}`);
      }
      return 1;
    }

    for (const field of spec.fields) {
      const existing = typeof current[field.key] === 'string' ? (current[field.key] as string) : '';
      if (existing) {
        const keep = await confirm(`  ${field.label} 已配置，覆盖？`, false);
        if (keep) values[field.key] = field.secret ? await askSecret(`  ${field.label}（留空保留原值）: `) : '';
        continue;
      }
      info(`  ${dim(field.source)}`);
      const answer = field.secret
        ? await askSecret(`  ${field.label}: `)
        : await ask(`  ${field.label}: `);
      if (answer) values[field.key] = answer;
    }
  }

  const clean = sanitizedFields(providerId, values);
  if (!Object.keys(clean).length) {
    warn('没有写入任何新值');
    return 0;
  }

  const merged = { ...current, ...clean };
  const complete = hasCredentials(providerId, merged);

  try {
    patchConfig(path, {
      [id]: { ...clean, enabled: complete },
    });
  } catch (e) {
    error(`写入失败：${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const stillMissing = missingFields(providerId, merged);
  if (complete) {
    success(`${spec.name} 已配置完成，已自动 enabled`);
  } else {
    warn(`${spec.name} 仍缺：${stillMissing.map((f) => f.label).join('、')}（保持 enabled=false）`);
  }
  info(`  写入位置：${path}`);
  return complete ? 0 : 1;
}

