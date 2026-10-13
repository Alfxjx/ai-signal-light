/**
 * 本地 Agent 工具运行状态类型。
 * 覆盖：Codex CLI / ChatGPT 桌面客户端、MiniMax Code (mcode)、opencode。
 * 数据源均为本机进程 + 本地文件/本地服务（只读），不依赖任何远程 API。
 */

/** 工具标识 */
export type LocalToolId = 'codex' | 'mcode' | 'opencode';

/** 聚合状态：工作中 > 空闲 > 离线（用于整卡/工具徽标） */
export type LocalToolState = 'working' | 'idle' | 'offline';

/** 忙态细分：思考中 / 编辑中 / 空闲 / 离线（工具级离线；项目级只会是前三者） */
export type LocalToolPhase = 'thinking' | 'editing' | 'idle' | 'offline';

/** 一个工具下的"项目"行：按工作目录归并（仿 KimiProject） */
export interface LocalToolProject {
  /** 归并 key：normalized cwd，无 cwd 时退化为 title/id */
  id: string;
  /** 显示名：目录 basename，无 cwd 时用会话标题 */
  name: string;
  cwd: string | null;
  title: string | null;
  /** 该项目聚合忙态（thinking > editing > idle） */
  phase: LocalToolPhase;
  /** 最近活动时间，毫秒 */
  lastActive: number | null;
}

/** 单个工具的运行状态 */
export interface LocalToolStatus {
  /** 进程是否在跑（可靠信号；mcode/opencode 由 pid 存活判定，codex 由进程名匹配） */
  running: boolean;
  /** 工具级聚合状态（由 projects 最忙 phase 派生） */
  state: LocalToolState;
  /** 工具级聚合忙态：thinking > editing > idle；未运行 → offline */
  phase: LocalToolPhase;
  /** 该工具的活跃项目列表（按工作目录归并） */
  projects: LocalToolProject[];
  /** 工具级最后活跃时间（projects 里最新），毫秒 */
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
