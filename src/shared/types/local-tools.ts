/**
 * 本地 Agent 工具运行状态类型。
 * 覆盖：Codex CLI / ChatGPT 桌面客户端、MiniMax Code (mcode)、opencode。
 * 数据源均为本机进程 + 本地文件（只读），不依赖任何远程 API。
 */

/** 工具标识 */
export type LocalToolId = 'codex' | 'mcode' | 'opencode';

/** 单工具聚合状态：工作中 > 空闲 > 离线 */
export type LocalToolState = 'working' | 'idle' | 'offline';

/** 单个工具的运行状态 */
export interface LocalToolStatus {
  /** 进程是否在跑（可靠信号；mcode/opencode 由 pid 存活判定，codex 由进程名匹配） */
  running: boolean;
  /** 聚合状态：running 且最近活跃 → working；running → idle；否则 offline */
  state: LocalToolState;
  /** 最近活跃会话的工作目录（当前仅 codex 能提供） */
  cwd: string | null;
  /** 最后活跃时间，毫秒时间戳（会话文件最后写入 / 标记启动时间） */
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
