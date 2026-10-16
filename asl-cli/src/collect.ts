import {
  configPath,
  enabledProviders,
  loadConfig,
  type ProviderDefinition,
  type ProviderState,
  type RawAppConfig,
  type Thresholds,
} from 'providers-core';

export interface CollectResult {
  configPath: string;
  /** loadConfig 的错误（文件缺失 / 解析失败 / 结构异常）；null 表示正常 */
  configError: string | null;
  thresholds: Thresholds;
  states: ProviderState[];
}

/** 单家取数 → ProviderState：成功记 windows/balance，失败记 error 文案（与 opencode-plugin tui.tsx fetchOne 一致） */
export async function fetchState(def: ProviderDefinition, raw: RawAppConfig): Promise<ProviderState> {
  const lastUpdated = new Date().toISOString();
  try {
    const result = await def.fetch(raw);
    return {
      id: def.id,
      name: def.name,
      windows: result.windows,
      balance: result.balance,
      error: null,
      lastUpdated,
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '拉取失败';
    return { id: def.id, name: def.name, windows: [], balance: null, error: message, lastUpdated };
  }
}

export async function collectStates(): Promise<CollectResult> {
  const path = configPath();
  const loaded = loadConfig(path);
  if (loaded.error) {
    return { configPath: path, configError: loaded.error, thresholds: loaded.thresholds, states: [] };
  }
  const defs = enabledProviders(loaded.config);
  const states = await Promise.all(defs.map((d) => fetchState(d, loaded.config)));
  return { configPath: path, configError: null, thresholds: loaded.thresholds, states };
}
