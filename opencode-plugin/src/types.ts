export type ProviderId = 'kimi' | 'minimax' | 'volcengine' | 'deepseek' | 'mimo';

/** 百分比型窗口。percent 一律是「已用 %」（越接近 100 越危险） */
export interface WindowView {
  label: '5h' | '周' | '月';
  percent: number;
  /** Kimi 给 ISO 绝对时间；MiniMax 给「距重置的毫秒数」；火山给秒级时间戳转成的 ISO */
  resetTime: string | null;
}

export interface BalanceView {
  currency: string | null;
  total: number;
}

/** 单家取数结果：要么给 windows，要么给 balance */
export interface ProviderResult {
  windows: WindowView[];
  balance: BalanceView | null;
}

export interface ProviderState {
  id: ProviderId;
  name: string;
  windows: WindowView[];
  balance: BalanceView | null;
  /** null 表示成功；否则是可直接渲染的中文文案。'no_token' 由 format.errorLabel 转成「未配置」 */
  error: string | null;
  lastUpdated: string | null;
}
