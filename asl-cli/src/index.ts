#!/usr/bin/env node
import { Command } from 'commander';
import { PROVIDERS, type Thresholds } from 'providers-core';
import { collectStates } from './collect.js';
import { buildJson } from './json.js';
import { renderUsage } from './render.js';
import { renderDoctor } from './doctor.js';
import { watchLoop } from './watch.js';

interface UsageOptions {
  json?: boolean;
  provider?: string;
  watch?: boolean;
  watchInterval: string;
}

const PROVIDER_IDS = PROVIDERS.map((p) => p.id).join(' | ');

async function runUsage(opts: UsageOptions): Promise<number> {
  const { configPath, configError, thresholds, states } = await collectStates();

  if (configError) {
    if (opts.json) {
      process.stdout.write(JSON.stringify(buildJson(configPath, [], configError), null, 2) + '\n');
    } else {
      process.stderr.write(`asl: ${configError}\n路径：${configPath}\n请先在桌面端设置页配置并保存。\n`);
    }
    return 1;
  }

  if (opts.provider && !states.some((s) => s.id === opts.provider)) {
    process.stderr.write(
      `asl: 未启用的 provider「${opts.provider}」（已启用：${states.map((s) => s.id).join(', ') || '无'}）\n`,
    );
    return 1;
  }
  const filtered = opts.provider ? states.filter((s) => s.id === opts.provider) : states;

  if (opts.watch) {
    const interval = Math.max(5, Number(opts.watchInterval) || 60);
    await watchLoop(interval, async () => {
      const fresh = await collectStates();
      return renderUsage(fresh.states, {
        configPath: fresh.configPath,
        thresholds: fresh.thresholds as Thresholds,
        now: Date.now(),
        color: process.stdout.isTTY === true,
      });
    });
    return 0;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(buildJson(configPath, filtered), null, 2) + '\n');
  } else {
    process.stdout.write(
      renderUsage(filtered, { configPath, thresholds, now: Date.now(), color: process.stdout.isTTY === true }) + '\n',
    );
  }

  const allFailed = states.length > 0 && states.every((s) => s.error !== null);
  return allFailed ? 2 : 0;
}

async function usageAction(opts: UsageOptions): Promise<void> {
  process.exitCode = await runUsage(opts);
}

const program = new Command();
program.name('asl').description('AI状态监控 CLI：6 家供应商用量配额').version('0.1.0');

program
  .command('usage')
  .description('输出用量配额（默认命令）')
  .option('--json', '输出结构化 JSON（无颜色）')
  .option('-p, --provider <id>', `只看一家（${PROVIDER_IDS}）`)
  .option('--watch', '常驻原地刷新')
  .option('--watch-interval <seconds>', '刷新间隔秒数（watch 模式，最小 5）', '60')
  .action(usageAction);

program.command('config').description('显示 config 路径与各家启用/凭据状态').action(() => {
  process.stdout.write(renderDoctor() + '\n');
});

// 无子命令时默认 usage（纯表格）
program.action(() => usageAction({ watchInterval: '60' }));

await program.parseAsync(process.argv);
