import type { DetectorAllStatus } from './detector';
import type { UsageSnapshot, UsageUpdatePayload } from './usage';
import type { UsageThresholds } from './config';

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
  | { type: 'thresholdsChanged'; thresholds: UsageThresholds };
