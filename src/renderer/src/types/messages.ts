// WebSocket 消息体类型。
// 从 src/shared/types/ 统一导出，保持渲染层 import 路径兼容。

export type {
  ClaudeProject,
  DetectorDetails,
  AssistantStatus,
  DetectorAllStatus,
} from '../../../shared/types/detector';

export type {
  UsageError,
  ProviderId,
  UsageMetric,
  KimiUsageData,
  MinimaxUsageData,
  CopilotPremiumData,
  CopilotUsageData,
  UsageProviderState,
  UsageUpdatePayload,
} from '../../../shared/types/usage';

export type {
  ClaudeHookPayload,
  WsMessage,
} from '../../../shared/types/websocket';

// App 内部聚合的 usage 状态形状（渲染层专用）
export interface UsageState {
  kimi: import('../../../shared/types/usage').UsageProviderState | null;
  minimax: import('../../../shared/types/usage').UsageProviderState | null;
  copilot: import('../../../shared/types/usage').UsageProviderState | null;
  enabled: Record<string, boolean>;
}

// usageInit 推送的 payload 形状
export interface UsageInitPayload {
  kimi: import('../../../shared/types/usage').UsageProviderState | null;
  minimax: import('../../../shared/types/usage').UsageProviderState | null;
  copilot: import('../../../shared/types/usage').UsageProviderState | null;
  enabled?: Record<string, boolean>;
  intervalMinutes?: number;
}
