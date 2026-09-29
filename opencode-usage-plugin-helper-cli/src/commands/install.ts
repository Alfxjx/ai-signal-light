// install：生成 opencode 的插件转发文件。
//
// opencode 只会自动扫描 ~/.config/opencode/plugins/ 下的插件；
// 写进 cli.json 的 plugins 实测不生效（README 有记录）。所以必须生成这个转发文件。

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { opencodePluginsDir, pluginEntry, repoPluginDir, stubContent, stubPath } from '../paths.js';
import { bold, error, info, success, step, warn, padDisplay, displayWidth } from '../ui.js';

export function install(force: boolean): number {
  const stub = stubPath();
  const entry = pluginEntry();

  if (!existsSync(entry)) {
    error(`插件入口不存在：${entry}`);
    info(`  插件源码目录：${repoPluginDir()}`);
    return 1;
  }

  if (existsSync(stub) && !force) {
    warn(`已存在，没有改动：${stub}`);
    step('要覆盖请加 --force（会先把旧文件备份成 .bak）');
    return 0;
  }

  if (existsSync(stub) && force) {
    const backup = `${stub}.bak`;
    try {
      copyFileSync(stub, backup);
      step(`旧文件已备份到 ${backup}`);
    } catch (e) {
      error(`备份失败，已中止：${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }

  const content = stubContent(dirname(stub), entry);
  try {
    mkdirSync(dirname(stub), { recursive: true });
    writeFileSync(stub, content, 'utf8');
  } catch (e) {
    error(`写入失败：${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  success(`已生成转发文件：${bold(stub)}`);
  info(`  内容：${content.trim()}`);
  info('');
  step('转发文件用相对路径 —— 换机器时只要目录层级不变就还能用。');
  step('别忘了依赖（这是运行时前提，不是开发前提）：');
  info(`  cd ${repoPluginDir()} && npm install --legacy-peer-deps`);
  info('');
  step('然后重开 opencode。');
  return 0;
}

/** 打印 opencode 插件目录位置，doctor 之外单独可用 */
export function where(): number {
  // 中英文混排的标签要用显示宽度对齐
  const rows: Array<[string, string]> = [
    ['opencode 插件目录', opencodePluginsDir()],
    ['转发文件', stubPath()],
    ['插件入口', pluginEntry()],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => displayWidth(label)));
  for (const [label, value] of rows) {
    info(`${padDisplay(label, labelWidth)}  ${value}`);
  }
  return 0;
}

