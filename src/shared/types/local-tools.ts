/**
 * 本地 Agent 工具运行状态类型。
 * 覆盖：Codex CLI / ChatGPT 桌面客户端、MiniMax Code (mcode)、opencode。
 * 数据源均为本机进程 + 本地文件/本地服务（只读），不依赖任何远程 API。
 */

/** 工具标识 */
export type LocalToolId = 'codex' | 'mcode' | 'opencode';

/** 聚合状态：工作中 > 空闲 > 离线（用于整卡徽标） */
export type LocalToolState = 'working' | 'idle' | 'offline';

/** 忙态细分（UI 显示思考中/编辑中/空闲/离线） */
export type LocalToolPhase = 'thinking' | 'editing' | 'idle' | 'offline';

/** 单个工具的运行状态 */
export interface LocalToolStatus {
  /** 进程是否在跑（可靠信号；mcode/opencode 由 pid 存活判定，codex 由进程名匹配） */
  running: boolean;
  /** 聚合状态：phase ∈ thinking/editing → working；idle → idle；offline → offline */
  state: LocalToolState;
  /** 忙态细分：思考中 / 编辑中 / 空闲 / 离线 */
  phase: LocalToolPhase;
  /** 最近活跃会话的工作目录 */
  cwd: string | null;
  /** 最近活跃会话标题 */
  title: string | null;
  /** 最后活跃时间，毫秒时间戳 */
  lastActive: number | null;
  /** 附加信息：来源标注（桌面/CLI）、版本、服务地址等 */
  detail: string | null;
}

/** 整卡状态（推送给渲染层） */
export interface LocalToolsStatus {
  /** 任一工具数据源存在（装过工具）→ 渲染卡片 */
  available: boolean;
  /** 整卡聚合状态 */
  state: LocalToolState;
  tools: Record<LocalToolId, LocalToolStatus>;
  lastUpdate: number;
}
