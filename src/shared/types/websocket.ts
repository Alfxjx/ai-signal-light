import type { DetectorAllStatus } from './detector';
import type { UsageSnapshot, UsageUpdatePayload } from './usage';
import type { MobileAppConfig, UsageThresholds } from './config';

export interface ClaudeHookPayload {
  event: 'Notification' | 'Stop' | 'PreToolUse';
  cwd: string | null;
  sessionId: string | null;
  ts: number;
  message?: string;
  toolName?: string;
}

export interface PendingHook {
  event: ClaudeHookPayload['event'];
  ts: number;
  message?: string;
  toolName?: string;
}

export type WsMessage =
  | { type: 'init'; data: DetectorAllStatus & { usage?: UsageSnapshot & { enabled?: Record<string, boolean>; intervalMinutes?: number; thresholds?: UsageThresholds }; pending?: Record<string, PendingHook> } }
  | { type: 'statusChange'; assistantId: string; data: { status?: string; details: { projects: unknown[] } } }
  | { type: 'usageInit'; data: UsageSnapshot & { enabled?: Record<string, boolean>; intervalMinutes?: number; thresholds?: UsageThresholds } }
  | (UsageUpdatePayload & { type: 'usageUpdate' })
  | (ClaudeHookPayload & { type: 'claudeHook' })
  | { type: 'pendingChanged'; byCwd: Record<string, PendingHook> }
  | { type: 'floatingBallState'; visible: boolean }
  | { type: 'thresholdsChanged'; thresholds: UsageThresholds }
  | { type: 'configSnapshot'; requestId: string; config: MobileAppConfig };

/** 客户端 → 服务端的 WebSocket 请求（手机端扫码后用 getConfig 拉取配置） */
export type ClientWsMessage =
  | { type: 'refresh' }
  | { type: 'getConfig'; requestId: string };
