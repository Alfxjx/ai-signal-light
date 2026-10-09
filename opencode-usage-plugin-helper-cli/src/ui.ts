// 终端输出。集中一处，保证颜色 / 符号 / 缩进一致。

/** CJK / 全角字符占 2 列 */
function isWideChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6)
  );
}

export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += isWideChar(ch) ? 2 : 1;
  return w;
}

/**
 * 按**显示宽度**右侧补空格。
 * 不能用 String.padEnd —— 它数的是 UTF-16 码元，「火山」算 2 却占 4 列，
 * 混排中英文的表格会错开（doctor 的检查项就有中英文混排）。
 */
export function padDisplay(text: string, width: number): string {
  const gap = width - displayWidth(text);
  return gap > 0 ? text + ' '.repeat(gap) : text;
}

const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

function paint(code: string, text: string): string {
  return useColor ? `\u001B[${code}m${text}\u001B[0m` : text;
}

export const bold = (t: string) => paint('1', t);
export const dim = (t: string) => paint('2', t);
export const red = (t: string) => paint('31', t);
export const green = (t: string) => paint('32', t);
export const yellow = (t: string) => paint('33', t);
export const cyan = (t: string) => paint('36', t);

export const OK = green('✔');
export const WARN = yellow('!');
export const BAD = red('✘');
export const DOT = dim('·');

export function info(msg: string): void {
  console.log(msg);
}

export function step(msg: string): void {
  console.log(`${cyan('›')} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${OK} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${WARN} ${msg}`);
}

export function error(msg: string): void {
  console.error(`${BAD} ${msg}`);
}

/** 命令用法 */
export function usage(): void {
  console.log(`
${bold('usage-helper')} —— opencode 用量侧边栏插件配置助手

${bold('用法')}
  usage-helper <命令> [选项]

${bold('命令')}
  ${cyan('init')}              在插件读取的路径生成 config.json 骨架
  ${cyan('set')} <provider>    写入某家的凭据（掩码输入）
  ${cyan('doctor')}            体检：配置、转发文件、node_modules
  ${cyan('install')}           生成 opencode 插件转发文件

${bold('选项')}
  --force                   覆盖已存在的文件（init / install）
  --token <值>               非交互写入，跳过掩码输入
  --json                    以 JSON 输出（doctor）

${bold('可用 provider')}
  kimi  minimax  volcengine  deepseek  mimo
`);
}
