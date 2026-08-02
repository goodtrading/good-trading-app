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

export type PositionMode = "LONG_ONLY" | "LONG_SHORT";

export type TradePositionMode = "LONG" | "SHORT";

/** Hedge leg identifier — persisted on trades in HEDGE account mode. */
export type PositionSide = "LONG" | "SHORT";

/** Account-level PERP positioning (One-way net vs Hedge dual-leg). */
export type PerpAccountPositionMode = import("@/lib/portfolio/hedge/PerpAccountPositionMode").PerpAccountPositionMode;

export type MarginMode = "CROSS" | "ISOLATED";

export type PositionStatus = "OPEN" | "LIQUIDATED";

/** Immutable trade ledger entry — never stores PnL. */
export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  timestamp: number;
  source: TradeSource;
  /** Persisted fee breakdown — always present; mirrored as TRADE_FEE FinancialEvent. */
  fees: import("@/lib/portfolio/fees/types").TradeFeeRecord;
  /** Engine-level metadata (optional; schema-compatible). */
  leverage?: number;
  positionMode?: TradePositionMode;
  /** Hedge leg — required for new HEDGE-mode executions. */
  positionSide?: PositionSide;
  marginMode?: MarginMode;
  /** True when this fill was a forced liquidation close. */
  liquidation?: boolean;
  /** True when execution was constrained as reduce-only (PERP). */
  reduceOnly?: boolean;
  /** True when the originating order was post-only (PERP LIMIT). */
  postOnly?: boolean;
  /** Maker/taker classification for future fee routing (FASE 12.5). */
  executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
  /** How the fill was triggered (FASE 12.7 OCO / TP-SL). */
  triggerReason?: import("@/lib/portfolio/oco/OcoGroup").TradeTriggerReason;
}

/** Derived from trades + market price — never persisted. */
export interface Position {
  symbol: string;
  /** Hedge leg — set when account is in HEDGE mode (quantity always ≥ 0). */
  side?: PositionSide;
  /** ONE_WAY: signed (+long / −short). HEDGE: unsigned magnitude with `side`. */
  quantity: number;
  avgEntry: number;
  /** Mark price (same as marketPrice). */
  marketPrice: number;
  markPrice: number;
  marginMode: MarginMode;
  leverage: number;
  /** Initial margin locked at entry notional / leverage. */
  entryMargin: number;
  maintenanceMargin: number;
  liquidationPrice: number | null;
  positionValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  roiPercent: number;
  /** Maintenance / position equity × 100. Approaches 100% near liquidation. */
  marginRatio: number;
  status: PositionStatus;
}

/** Derived portfolio summary — never persisted. */
export interface Portfolio {
  /** Available balance for new margin (not wallet). */
  cashBalance: number;
  /** Deposit + realized PnL (futures wallet). */
  walletBalance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  totalReturnPercent: number;
  marginUsed?: number;
  leverage?: number;
  marginMode?: MarginMode;
  /** Account-level margin ratio (maintenance / equity × 100). */
  marginRatio?: number;
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
  /**
   * Immutable genesis deposit for this PERP ledger (historical).
   * Never mutated by transfers, deposits, or withdrawals.
   */
  initialCashBalance: number;
  /**
   * Mutable PERP wallet cash (USDT). Transfers and future deposits/withdrawals
   * adjust this field. Wallet balance for margin = walletCash + realizedPnL.
   * Defaults to initialCashBalance when loading legacy ledgers.
   */
  walletCash: number;
  trades: Trade[];
  /** Append-only non-position wallet movements (FASE 12.1). */
  financialEvents?: import("@/lib/portfolio/financial/types").FinancialEvent[];
  orders: Order[];
  fills: Fill[];
  /** OCO groups (FASE 12.7) — optional for legacy ledgers. */
  ocoGroups?: import("@/lib/portfolio/oco/OcoGroup").OcoGroup[];
  /** Trailing stops (FASE 12.8) — optional for legacy ledgers. */
  trailingStops?: import("@/lib/portfolio/trailing/TrailingStop").TrailingStop[];
  /** Insurance fund (FASE 12.9) — optional legacy mirror. */
  insuranceFund?: import("@/lib/portfolio/insurance/InsuranceFund").InsuranceFundState;
}

export interface PortfolioEngineState {
  portfolio: Portfolio;
  positions: Position[];
  trades: Trade[];
  financialEvents: import("@/lib/portfolio/financial/types").FinancialEvent[];
  /** Immutable genesis deposit. */
  initialCashBalance: number;
  /** Mutable PERP wallet cash. */
  walletCash: number;
}

export interface BrokerOrderParams {
  symbol: string;
  quantity: number;
  price: number;
}
