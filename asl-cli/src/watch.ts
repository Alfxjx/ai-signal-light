export function clearScreen(): void {
  process.stdout.write('\u001B[2J\u001B[1;1H');
}

/** 常驻刷新：立即渲染一次，之后每 intervalSec 原地重绘；Ctrl+C 退出 */
export async function watchLoop(intervalSec: number, render: () => Promise<string>): Promise<void> {
  const run = async (): Promise<void> => {
    clearScreen();
    process.stdout.write((await render()) + '\n');
  };
  await run();
  const timer = setInterval(() => {
    void run();
  }, intervalSec * 1000);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.exit(0);
  });
}
