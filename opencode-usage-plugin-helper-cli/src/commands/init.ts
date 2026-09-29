// init：在插件读取的路径生成 config.json 骨架。

import { configPath } from '../paths.js';
import { readConfig, writeConfigAtomic, type Config } from '../config-io.js';
import { PROVIDERS } from '../providers.js';
import { bold, error, step, success, warn, info } from '../ui.js';

const DEFAULT_THRESHOLDS = { warn: 50, danger: 80 };

/**
 * 重置我们管的键，**其余一律原样保留**。
 *
 * 用「浅拷贝 + 整节点替换 provider」而不是整文件覆写，也不是深合并：
 * - 深合并会留下旧的 token，`--force` 就不算重置了
 * - 整文件覆写会把 window / pet / floatingBall / lanMode 这些
 *   桌面程序专属字段全清空（真机 smoke 测出过这个 bug）
 */
function resetOwnedKeys(existing: Config): Config {
  const out: Config = { ...existing };
  for (const p of PROVIDERS) {
    // 整节点替换：旧凭据被丢弃，enabled 回到 false
    out[p.id] = { enabled: false };
  }
  // 阈值是用户偏好，不算凭据，保留原值
  out.thresholds = existing.thresholds ?? { ...DEFAULT_THRESHOLDS };
  return out;
}

export function init(force: boolean): number {
  const path = configPath();
  const { config, error: readErr, existed } = readConfig(path);

  if (readErr) {
    error(`${readErr}：${path}`);
    info('  请先修好这个文件，或删掉它再重跑 init。');
    return 1;
  }

  if (existed && !force) {
    warn(`已存在，没有改动：${path}`);
    step('要重置骨架请加 --force（会丢弃已写入的凭据，桌面程序的设置不受影响）');
    return 0;
  }

  const next = existed ? resetOwnedKeys(config) : resetOwnedKeys({});

  try {
    writeConfigAtomic(path, next);
  } catch (e) {
    error(`写入失败：${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  if (existed && force) {
    success(`已重置配置骨架：${bold(path)}`);
    step('五家凭据已清空；window / pet / lanMode 等桌面程序字段原样保留');
  } else {
    success(`已生成配置骨架：${bold(path)}`);
  }
  info('');
  step('下一步：');
  info('  1. 写入凭据，例如  usage-helper set kimi');
  info('  2. 装转发文件      usage-helper install');
  info('  3. 体检            usage-helper doctor');
  return 0;
}
