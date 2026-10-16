import type { ProviderState } from 'providers-core';

export interface UsageJson {
  configPath: string;
  fetchedAt: string;
  /** config.json 缺失 / 解析失败时的中文文案 */
  error?: string;
  providers: ProviderState[];
}

export function buildJson(
  configPath: string,
  states: ProviderState[],
  error?: string,
  fetchedAt: Date = new Date(),
): UsageJson {
  const json: UsageJson = { configPath, fetchedAt: fetchedAt.toISOString(), providers: states };
  if (error) json.error = error;
  return json;
}
