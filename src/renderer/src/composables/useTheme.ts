import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import type { ThemeMode } from '../../../shared/types/config';

/**
 * 把主题模式落到 <html> 的 dark class 上。
 * 'system' 时跟随系统深浅色，并返回清理函数。
 */
function attachSystemListener(): () => void {
  const apply = () => applyTheme('system');
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', apply);
  return () => mq?.removeEventListener?.('change', apply);
}

/** 实际生效的深浅色：DOM class 不是响应式数据，由 applyTheme 写入，供 UI（主题按钮图标）读取 */
const isDark = ref(document.documentElement.classList.contains('dark'));

export function applyTheme(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  document.documentElement.classList.toggle('dark', dark);
  isDark.value = dark;
}

/**
 * 启动时从主进程读主题设置并应用，同时监听主进程广播的 theme:changed 即时切换。
 * window.electronAPI 可能不存在（如纯浏览器调试），做防御处理。
 */
export function useTheme(): { mode: Ref<ThemeMode>; isDark: Ref<boolean> } {
  const mode = ref<ThemeMode>('dark');
  let detachSystem: (() => void) | null = null;

  onMounted(async () => {
    try {
      const settings = await window.electronAPI?.getSettings?.();
      if (settings?.appearance?.theme) {
        mode.value = settings.appearance.theme;
      }
    } catch {
      // 读不到就用默认暗色
    }
    applyTheme(mode.value);
    if (mode.value === 'system') {
      detachSystem = attachSystemListener();
    }
    // 其他窗口改了主题，主进程广播过来后即时切换
    window.electronAPI?.onThemeChanged?.((theme) => {
      mode.value = theme;
      applyTheme(theme);
      detachSystem?.();
      detachSystem = theme === 'system' ? attachSystemListener() : null;
    });
  });

  onBeforeUnmount(() => {
    detachSystem?.();
  });

  return { mode, isDark };
}
