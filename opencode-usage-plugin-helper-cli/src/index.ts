#!/usr/bin/env node
// usage-helper —— opencode 用量侧边栏插件的配置助手。
//
// 面向「没装桌面程序的 opencode 用户」：插件只读 config.json，
// 而那个文件平时由桌面程序生成，这里负责把它建起来并体检。

import { configPath } from './paths.js';
import { init } from './commands/init.js';
import { set } from './commands/set.js';
import { doctor } from './commands/doctor.js';
import { install, where } from './commands/install.js';
import { error, info, usage } from './ui.js';

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const name = arg.slice(2);
    const next = argv[i + 1];
    // `--token 值` 与 `--token=值` 都支持；下一个也是 flag 或没有时按布尔 flag 处理
    if (next && !next.startsWith('--')) {
      flags.set(name, next);
      i++;
    } else {
      flags.set(name, true);
    }
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), flags };
}

async function dispatch(args: Args): Promise<number> {
  const { command, positional, flags } = args;

  switch (command) {
    case 'init':
      return init(flags.get('force') === true);

    case 'set': {
      const id = positional[0];
      if (!id) {
        error('用法：usage-helper set <provider> [--token <值>]');
        info('  provider：kimi  minimax  volcengine  deepseek  mimo');
        return 1;
      }
      const token = flags.get('token');
      return set(id, token === true ? undefined : token);
    }

    case 'doctor':
      return doctor(flags.get('json') === true);

    case 'install':
      return install(flags.get('force') === true);

    case 'where':
      return where();

    case 'help':
    case '--help':
    case '-h':
      usage();
      return 0;

    default:
      error(`未知命令：${command}`);
      usage();
      return 1;
  }
}

try {
  process.exitCode = await dispatch(parseArgs(process.argv.slice(2)));
} catch (e) {
  // 兜底：任何没预料到的异常都给一句人话，而不是甩堆栈
  error(`意外错误：${e instanceof Error ? e.message : String(e)}`);
  info(`配置路径：${configPath()}`);
  process.exitCode = 1;
}

