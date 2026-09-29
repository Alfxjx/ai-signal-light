// 终端交互。掩码输入靠「读一个字符、回显一个 *」，不回显原字符。

import { createInterface } from 'node:readline';

/** 是否是 TTY —— 非交互环境（管道、CI）下不要试图读键盘 */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** 普通输入 */
export function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** 是 / 否 */
export async function confirm(question: string, fallback = false): Promise<boolean> {
  const hint = fallback ? '[Y/n]' : '[y/N]';
  const answer = (await ask(`${question} ${hint} `)).toLowerCase();
  if (!answer) return fallback;
  return answer === 'y' || answer === 'yes';
}

/**
 * 掩码输入：屏幕上只出现 *，回车后不残留。
 * 逐字符读 raw mode，避免明文进入 readline 的回显路径。
 */
export function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';
    const cleanup = () => {
      if (stdin.setRawMode) stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdin.removeListener('data', onData);
      // 换行，让光标落到下一行
      process.stdout.write('\n');
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        switch (ch) {
          // Ctrl+C
          case '\u0003':
            cleanup();
            process.exit(130);
            break;
          // Enter / Ctrl+D
          case '\r':
          case '\n':
          case '\u0004':
            cleanup();
            resolve(value);
            return;
          // Backspace
          case '\b':
          case '\u007f':
            if (value.length > 0) {
              value = value.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          // Ctrl+U 清空整行
          case '\u0015':
            process.stdout.write('\b \b'.repeat(value.length));
            value = '';
            break;
          default:
            // 忽略控制字符，只收可打印字符
            if (ch >= ' ') {
              value += ch;
              process.stdout.write('*');
            }
        }
      }
    };

    stdin.on('data', onData);
  });
}
