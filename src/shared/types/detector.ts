/**
 * @deprecated 保留仅作历史兼容，不再使用 IDLE/EXECUTING/WAITING 状态模型
 */
export enum Status {
  IDLE = 'idle',
  EXECUTING = 'executing',
  WAITING = 'waiting',
}

export interface ClaudeProject {
  id: string;
  name: string;
  source?: 'cwd' | 'slug' | 'id';
  cwd?: string | null;
  lastResponse: number | string | null;
}

export interface DetectorDetails {
  projects: ClaudeProject[];
  lastUpdate?: number | string;
}

export interface AssistantStatus {
  /** @deprecated 保留仅作历史兼容 */
  status: Status | 'projects';
  details: DetectorDetails;
  lastUpdate: number | null;
  pid: number | null;
}

export type DetectorAllStatus = Record<string, AssistantStatus>;
