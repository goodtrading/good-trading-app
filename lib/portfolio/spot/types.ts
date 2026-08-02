/**
 * SPOT domain models — greenfield, asset-ownership based.
 * No positions, margin, leverage, or liquidation fields.
 */

export type SpotOrderStatus =
  | "PENDING"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED";

export type SpotOrderType = "MARKET" | "LIMIT" | "STOP";

export type SpotOrderPurpose = "TRADE" | "TAKE_PROFIT" | "STOP_LOSS";

export type SpotBalance = {
  asset: string;
  free: number;
  locked: number;
  /** free + locked */
  total: number;
};

/** Immutable spot fill — asset ownership transfer. */
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

/** Pending / open spot order. */
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
  /** Base asset protected by TP/SL orders (e.g. "BTC"). */
  positionAsset: string | null;
  purpose: SpotOrderPurpose;
  createdAt: number;
  updatedAt: number;
};

/** Full in-memory snapshot of a wallet's spot ledger. */
export type SpotLedgerState = {
  walletId: string;
  balances: SpotBalance[];
  trades: SpotTrade[];
  orders: SpotOrder[];
  createdAt: number;
  updatedAt: number;
};

export function computeSpotBalanceTotal(free: number, locked: number): number {
  return free + locked;
}

export function createSpotBalance(
  asset: string,
  free: number,
  locked: number = 0,
): SpotBalance {
  return {
    asset,
    free,
    locked,
    total: computeSpotBalanceTotal(free, locked),
  };
}

export function createEmptySpotLedgerState(
  walletId: string,
  initialUsdt: number = 0,
): SpotLedgerState {
  const now = Date.now();
  const balances: SpotBalance[] =
    initialUsdt > 0 ? [createSpotBalance("USDT", initialUsdt, 0)] : [];

  return {
    walletId,
    balances,
    trades: [],
    orders: [],
    createdAt: now,
    updatedAt: now,
  };
}
