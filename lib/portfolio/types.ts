export type PortfolioSourceId = "paper" | "binance" | "bingx" | "all";

export type PortfolioSourceType = "exchange" | "paper" | "wallet" | "consolidated";

export interface PortfolioBalance {
  totalValueUSD: number;
  todayPnl: number;
  todayPnlPercent: number;
}

export interface PortfolioPosition {
  symbol: string;
  name: string;
  type: "spot" | "futures" | "usdt";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  valueUSD: number;
  pnl: number;
  pnlPercent: number;
}

export interface PortfolioSnapshot {
  balance: PortfolioBalance;
  positions: PortfolioPosition[];
}

export interface PortfolioSourceMeta {
  id: PortfolioSourceId;
  name: string;
  shortLabel: string;
  type: PortfolioSourceType;
  brandColor: string;
  /** When false the chip is hidden (e.g. consolidated "all"). */
  isVisible: boolean;
  /** Future: remote logo URL or asset module. */
  logoUri?: string;
}

export interface PortfolioProvider {
  meta: PortfolioSourceMeta;
  getBalance(): Promise<PortfolioBalance>;
  getPositions(): Promise<PortfolioPosition[]>;
  getSnapshot(): Promise<PortfolioSnapshot>;
}

export interface PortfolioSourceContextValue {
  selectedSource: PortfolioSourceId;
  setSelectedSource: (source: PortfolioSourceId) => void;
  visibleSources: PortfolioSourceMeta[];
  getProvider: (id: PortfolioSourceId) => PortfolioProvider | undefined;
}
