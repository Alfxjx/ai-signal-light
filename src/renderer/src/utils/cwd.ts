// 跨平台 cwd 归一化：Windows 文件系统大小写不敏感，Mac/Linux 敏感
// hook payload 与 jsonl 中的 cwd 字符串可能大小写不一致，归一化后再比对/查表

const IS_WIN = typeof window !== 'undefined' && window.electronAPI?.platform === 'win32';

export function normalizeCwd(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  return IS_WIN ? cwd.toLowerCase() : cwd;
}
