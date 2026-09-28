import type { RawAppConfig } from '../config';
import type { ProviderId, ProviderResult } from '../types';
import { fetchKimi } from './kimi';
import { fetchMiniMax } from './minimax';
import { fetchVolcengine } from './volcengine';
import { fetchDeepseek } from './deepseek';
import { fetchMimo } from './mimo';

export interface ProviderDefinition {
  id: ProviderId;
  /** 侧边栏显示名，同时也是 config.json 里的字段名 */
  name: string;
  fetch(raw: RawAppConfig): Promise<ProviderResult>;
}

/** 百分比型：把窗口数组包成 ProviderResult */
async function quotaFetch(windows: Promise<ProviderResult['windows']>): Promise<ProviderResult> {
  return { windows: await windows, balance: null };
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'kimi',
    name: 'Kimi',
    fetch: (raw) => quotaFetch(fetchKimi(raw)),
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    fetch: (raw) => quotaFetch(fetchMiniMax(raw)),
  },
  {
    id: 'volcengine',
    name: '火山',
    fetch: (raw) => quotaFetch(fetchVolcengine(raw)),
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    fetch: async (raw) => ({ windows: [], balance: await fetchDeepseek(raw) }),
  },
  {
    id: 'mimo',
    name: 'MiMo',
    fetch: async (raw) => ({ windows: [], balance: await fetchMimo(raw) }),
  },
];
