// 跨平台 cwd 归一化（共享版本，可在 Node 与 Renderer 使用）

export function normalizeCwd(cwd: string | null | undefined, isWin32: boolean): string | null {
  if (!cwd) return null;
  return isWin32 ? cwd.toLowerCase() : cwd;
}
