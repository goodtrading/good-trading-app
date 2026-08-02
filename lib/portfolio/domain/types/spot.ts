/**
 * SPOT domain contracts (Phase 2 — types only).
 * SpotLedger is NOT implemented yet; these shapes define the target model.
 */

export type SpotOrderStatus =
  | "PENDING"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "PARTIALLY_FILLED";

export type SpotOrderType = "MARKET" | "LIMIT";

export type SpotBalance = {
  asset: string;
  free: number;
  locked: number;
  /** free + locked (canonical in SpotLedger implementation). */
  total: number;
};

/** Immutable spot fill — asset ownership transfer (target model). */
export type SpotTrade = {
  id: string;
  domain: "SPOT";
  walletId: string;
  baseAsset: string;
  quoteAsset: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  quoteQuantity: number;
  fees?: number;
  feeAsset?: string;
  timestamp: number;
};

/** Pending / open spot order (target model). */
export type SpotOrder = {
  id: string;
  domain: "SPOT";
  walletId: string;
  baseAsset: string;
  quoteAsset: string;
  side: "BUY" | "SELL";
  orderType: SpotOrderType;
  status: SpotOrderStatus;
  triggerPrice: number | null;
  quantity: number;
  filledQuantity: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Runtime intent for SPOT execution (Phase 2).
 * Mirrors legacy TradeExecutionRequest fields until SpotLedger exists.
 * Contract: leverage must be 1, marginMode must be CROSS, no positionMode.
 */
export type SpotExecutionIntent = {
  walletId: string | null;
  symbol: string;
  direction: "LONG" | "SHORT";
  orderType: SpotOrderType;
  marginMode: "CROSS" | "ISOLATED";
  leverage: number;
  quantity: number;
  margin: number;
  price: number;
  marketPrice: number;
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  /** Forbidden on SPOT — presence is rejected by ExecutionRouter. */
  positionMode?: never;
};
