// 路径解析。
//
// ⚠️ configPath() 与 ../opencode-plugin/src/config.ts 里的实现是**同一份逻辑**，
// 这里是副本而不是 import —— 因为跨包编译会让 tsc 的相对路径深度对不上
//（rootDir 只能取一个，而两边的目录层级不同），而这个 CLI 必须能独立编译运行。
// 防漂移靠 paths.test.ts 里的对照测试：直接 import 插件那份，断言两者结果相同。
//
// 插件侧已有跨平台兜底（APPDATA 为空时回退 homedir()/AppData/Roaming），
// 所以 macOS/Linux 上落到 ~/AppData/Roaming/AI状态监控/config.json，插件读到的就是同一个文件。

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** %APPDATA%\AI状态监控\config.json（正式版 userData，只读） */
export function configPath(): string {
  const appData = process.env.APPDATA?.trim()
    ? process.env.APPDATA.trim()
    : join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'AI状态监控', 'config.json');
}

/**
 * 本仓库里 opencode 插件的根目录。
 *
 * 不能用「从本文件位置固定上溯 N 层」—— 源码在 `src/paths.ts`，编译产物在
 * `dist/paths.js`，两者深度差一层，写死层数必然在其中一种布局下算错。
 * 改成向上找含 `opencode-plugin/src/tui.tsx` 的祖先目录，两种布局都对。
 */
export function repoPluginDir(): string {
  const entry = join('opencode-plugin', 'src', 'tui.tsx');
  let dir = dirname(fileURLToPath(import.meta.url));
  // 上溯 6 层足够覆盖 src/ 与 dist/ 两种布局，再多也没意义
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'opencode-plugin');
    if (existsSync(join(candidate, 'src', 'tui.tsx'))) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：按源码布局猜一个，让报错信息里有个可读的路径
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'opencode-plugin');
}

/** opencode 的全局插件发现目录 */
export function opencodePluginsDir(): string {
  return resolve(homedir(), '.config', 'opencode', 'plugins');
}

/** 转发文件路径：opencode 只会自动扫描这个目录下的插件 */
export function stubPath(): string {
  return resolve(opencodePluginsDir(), 'usage-sidebar', 'tui.ts');
}

/** 转发文件里要 re-export 的目标 */
export function pluginEntry(): string {
  return resolve(repoPluginDir(), 'src', 'tui.tsx');
}

/**
 * 从转发文件所在目录到目标文件的**相对路径**，转成正斜杠。
 *
 * 必须用相对路径：转发文件在仓库外（不受版本控制），换机器后绝对路径必然失效，
 * 而它到目标目录的距离通常不变，相对路径就还能用。
 * 跨盘符（Windows C: → D:）时 relative() 返回绝对路径，退化但不报错。
 */
export function relativeStubTarget(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile);
  const normalized = rel.split(sep).join('/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

/** 转发文件内容。保持与插件 README 里记录的形式一致。 */
export function stubContent(fromDir: string, toFile: string): string {
  return `export { default } from '${relativeStubTarget(fromDir, toFile)}';\n`;
}
