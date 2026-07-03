export type PortfolioSourceId = "paper" | "binance" | "bingx" | "all";

export type PortfolioSelection =
  | { type: "paper"; accountId: string }
  | { type: "exchange"; sourceId: "binance" | "bingx" };

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
  /** Paper account selection (multi-account). */
  selection: PortfolioSelection | null;
  paperAccounts: import("@/lib/portfolio/accounts/types").PortfolioAccount[];
  exchangeConnections: { binance: boolean; bingx: boolean };
  selectPaperAccount: (accountId: string) => Promise<void>;
  selectExchange: (sourceId: "binance" | "bingx") => void;
  createPaperAccount: (name: string, initialBalance: number) => Promise<import("@/lib/portfolio/accounts/types").PortfolioAccount>;
  deletePaperAccount: (accountId: string) => Promise<void>;
  refreshPortfolioView: () => Promise<void>;
  canCreatePaperAccount: boolean;
  isPaperView: boolean;
  selectedPaperAccountId: string | null;
}

// ── Portfolio Engine (trade-sourced) ────────────────────────────────────────

export type TradeSide = "BUY" | "SELL";

export type TradeSource = "PAPER" | "BINANCE" | "BINGX";

/** Immutable trade ledger entry — never stores PnL. */
export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  timestamp: number;
  source: TradeSource;
  fees?: number;
}

/** Derived from trades + market price — never persisted. */
export interface Position {
  symbol: string;
  quantity: number;
  avgEntry: number;
  marketPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

/** Derived portfolio summary — never persisted. */
export interface Portfolio {
  cashBalance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalReturnPercent: number;
}

/** Reserved for future broker order lifecycle. */
export interface Order {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  status: "pending" | "filled" | "cancelled";
  createdAt: number;
}

/** Reserved for future partial-fill tracking. */
export interface Fill {
  id: string;
  orderId: string;
  tradeId: string;
  quantity: number;
  price: number;
  timestamp: number;
}

export interface PortfolioPersistedState {
  initialCashBalance: number;
  trades: Trade[];
  orders: Order[];
  fills: Fill[];
}

export interface PortfolioEngineState {
  portfolio: Portfolio;
  positions: Position[];
  trades: Trade[];
  initialCashBalance: number;
}

export interface BrokerOrderParams {
  symbol: string;
  quantity: number;
  price: number;
}
