// doctor：体检。目标是回答「为什么侧边栏没显示 / 哪一步没做对」。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { configPath, repoPluginDir, stubPath } from '../paths.js';
import { readConfig } from '../config-io.js';
import { PROVIDERS, hasCredentials, missingFields, type ProviderId } from '../providers.js';
import { bold, dim, error, info, warn, OK, BAD, WARN, DOT, padDisplay } from '../ui.js';

export interface Check {
  name: string;
  ok: boolean;
  /** false = 只是提示；true = 必须处理 */
  fatal: boolean;
  detail: string;
  fix?: string;
  /** 弱化显示（「未启用」「已配置」这类没有动作项的状态）。只影响终端着色，不影响 --json */
  muted?: boolean;
}

function checkStub(): Check {
  const path = stubPath();
  if (!existsSync(path)) {
    return {
      name: '插件转发文件',
      ok: false,
      fatal: true,
      detail: `不存在：${path}`,
      fix: 'usage-helper install',
    };
  }
  const content = readFileSync(path, 'utf8');
  if (!content.includes('export')) {
    return { name: '插件转发文件', ok: false, fatal: true, detail: '内容不是有效的转发文件', fix: 'usage-helper install --force' };
  }
  // 转发文件里那个相对路径现在还指得到吗
  const m = /from\s+['"]([^'"]+)['"]/.exec(content);
  if (m?.[1] && !m[1].startsWith('.')) {
    return {
      name: '插件转发文件',
      ok: false,
      fatal: true,
      detail: `用的是绝对路径：${m[1]}`,
      fix: '换机器后绝对路径会失效，改用相对路径：usage-helper install --force',
    };
  }
  if (m?.[1]) {
    const target = resolve(dirname(path), m[1]);
    if (!existsSync(target)) {
      return {
        name: '插件转发文件',
        ok: false,
        fatal: true,
        detail: `指向的目标不存在：${m[1]}`,
        fix: '路径可能变了：usage-helper install --force',
      };
    }
  }
  return { name: '插件转发文件', ok: true, fatal: false, detail: path };
}

function checkNodeModules(): Check {
  const dir = repoPluginDir();
  if (!existsSync(dir)) {
    return { name: '插件源码目录', ok: false, fatal: true, detail: `不存在：${dir}` };
  }
  const nm = resolve(dir, 'node_modules');
  if (!existsSync(nm)) {
    return {
      name: 'node_modules',
      ok: false,
      fatal: true,
      detail: `不存在：${nm}`,
      // 这是最容易漏的一步：README 记着它是运行时前提，不只是开发前提
      fix: `cd ${dir} && npm install --legacy-peer-deps`,
    };
  }
  return { name: 'node_modules', ok: true, fatal: false, detail: nm };
}

function checkConfig(): { check: Check; providers: Check[] } {
  const path = configPath();
  const { config, error: err, existed } = readConfig(path);

  if (!existed) {
    return {
      check: {
        name: 'config.json',
        ok: false,
        fatal: true,
        detail: `不存在：${path}`,
        fix: 'usage-helper init',
      },
      providers: [],
    };
  }
  if (err) {
    return {
      check: { name: 'config.json', ok: false, fatal: true, detail: `${err}（${path}）`, fix: '手工修好或删掉重跑 init' },
      providers: [],
    };
  }

  const providers: Check[] = [];
  for (const spec of PROVIDERS) {
    const node = (config[spec.id] ?? {}) as Record<string, unknown>;
    const enabled = node.enabled === true;
    const ready = hasCredentials(spec.id as ProviderId, node);

    if (!enabled) {
      providers.push({
        name: `  ${spec.name}`,
        ok: true,
        fatal: false,
        detail: '未启用',
        muted: true,
        fix: ready ? `usage-helper set ${spec.id}  # 凭据已填，开一下` : undefined,
      });
      continue;
    }
    if (!ready) {
      providers.push({
        name: `  ${spec.name}`,
        ok: false,
        fatal: true,
        // 已启用但没凭据 —— 插件会显示灰色「未配置」，不是静默隐藏
        detail: `已启用但缺：${missingFields(spec.id as ProviderId, node).map((f) => f.label).join('、')}`,
        fix: `usage-helper set ${spec.id}`,
      });
      continue;
    }
    providers.push({ name: `  ${spec.name}`, ok: true, fatal: false, detail: '已配置' });
  }

  const t = config.thresholds;
  const thresholdOk = typeof t?.warn === 'number' && typeof t?.danger === 'number';
  const check: Check = {
    name: 'config.json',
    ok: true,
    fatal: false,
    // detail 保持纯文本（不带 ANSI），着色留到打印时做 —— --json 输出要是干净的
    detail: thresholdOk
      ? `${path}  阈值 warn ${t?.warn} / danger ${t?.danger}`
      : `${path}  阈值用默认值 50 / 80`,
  };
  return { check, providers };
}

export function doctor(asJson: boolean): number {
  const { check: configCheck, providers } = checkConfig();
  const checks: Check[] = [configCheck, ...providers, checkStub(), checkNodeModules()];

  if (asJson) {
    console.log(JSON.stringify({ configPath: configPath(), stubPath: stubPath(), checks }, null, 2));
    return checks.some((c) => !c.ok && c.fatal) ? 1 : 0;
  }

  info('');
  info(bold('配置路径'));
  info(`  ${configPath()}`);
  info('');

  for (const c of checks) {
    const mark = c.ok ? OK : c.fatal ? BAD : WARN;
    const detail = c.muted ? dim(c.detail) : c.detail;
    // 用显示宽度补齐：检查项名是中英文混排（'插件转发文件' vs 'node_modules'），
    // String.padEnd 会把它们错开
    info(`${mark} ${padDisplay(c.name, 16)}${detail}`);
    if (c.fix && !c.ok) info(`  ${DOT} ${c.fix}`);
  }

  const fatal = checks.filter((c) => !c.ok && c.fatal);
  const enabledCount = providers.filter((p) => !p.muted).length;
  info('');
  if (fatal.length === 0) {
    info(`${OK} ${bold('环境就绪')} —— 重新启动 opencode 就能在侧边栏看到用量。`);
    if (enabledCount === 0) {
      warn('但目前一家都没启用，侧边栏会是空的 —— 先跑 usage-helper set <provider>');
      return 1;
    }
    if (enabledCount < providers.length) {
      info(`${DOT} 已启用 ${enabledCount} / ${providers.length} 家，其余可用 usage-helper set <provider> 打开`);
    }
    return 0;
  }
  error(`${fatal.length} 项需要处理（上面标 ${BAD} 的）`);
  return 1;
}

