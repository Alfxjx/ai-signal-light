/**
 * Kimi Code (web) 实时状态类型。
 * 读取本机 kimi web 服务的 REST + WebSocket API（实验性接口，字段随版本可能变化）。
 */

/** 单会话忙态（来自 WS 事件或 REST 轮询推算） */
export type KimiSessionState = 'thinking' | 'editing' | 'approval' | 'idle';

/** 头部聚合状态：任一待审核 > 任一编辑中 > 任一思考中 > 全空闲；offline 表示服务不可达 */
export type KimiAggregateState = 'thinking' | 'editing' | 'approval' | 'idle' | 'offline';

/** 面板里的"项目"行：按会话 metadata.cwd 归并后的一个目录 */
export interface KimiProject {
  /** 归并 key：normalized cwd，无 cwd 时退化为 workspace_id / session id */
  id: string;
  /** 显示名：目录 basename，无 cwd 时退化为会话标题 */
  name: string;
  cwd: string | null;
  /** 最近活动时间（会话 updated_at 兜底 created_at），毫秒 */
  lastResponse: number | null;
  /** 该目录聚合忙态（approval > editing > thinking > idle） */
  state: KimiSessionState;
  /** 是否有会话 pending_interaction != 'none'（红点，等同待审核） */
  pending: boolean;
}

/** 整卡状态（推送给渲染层） */
export interface KimiStatus {
  /** 服务是否在线；离线时渲染层隐藏整卡 */
  available: boolean;
  state: KimiAggregateState;
  projects: KimiProject[];
  lastUpdate: number | null;
}

/** REST /api/v1/sessions 的元素（只取用到的字段） */
export interface RestSession {
  id: string;
  workspace_id?: string;
  title?: string;
  busy: boolean;
  pending_interaction: string;
  updated_at?: string;
  created_at?: string;
  metadata?: { cwd?: string };
}