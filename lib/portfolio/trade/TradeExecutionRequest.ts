import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { TradingDomain } from "@/lib/portfolio/domain/types/execution";

export type TradeDirection = "LONG" | "SHORT";
export type TradeOrderType = "MARKET" | "LIMIT";
export type MarginMode = "CROSS" | "ISOLATED";

/**
 * Canonical trade intent from TradeEntryModal.
 * Phase 2: includes `domain` for ExecutionRouter; execution path unchanged.
 */
export type TradeExecutionRequest = {
  /** Financial domain — required for ExecutionRouter. */
  domain: TradingDomain;
  symbol: typeof PORTFOLIO_V1_SYMBOL;
  /** Wallet / paper account id — required for LIMIT registry. */
  walletId: string | null;
  direction: TradeDirection;
  orderType: TradeOrderType;
  marginMode: MarginMode;
  leverage: number;
  quantity: number;
  /** Margin in USDT used to size the order. */
  margin: number;
  /** Limit price, or market mark for MARKET orders. */
  price: number;
  /** Live mark used for MARKET execution and mark-to-market context. */
  marketPrice: number;
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  postOnlyEnabled: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
};

export function buildTradeExecutionRequest(input: {
  domain?: TradingDomain;
  walletId?: string | null;
  direction: TradeDirection;
  orderType: TradeOrderType;
  marginMode: MarginMode;
  leverage: number;
  quantity: number;
  margin: number;
  price: number;
  marketPrice: number;
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  postOnlyEnabled?: boolean;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
}): TradeExecutionRequest {
  return {
    /** Default PERP preserves legacy callers until they pass domain explicitly. */
    domain: input.domain ?? "PERP",
    symbol: PORTFOLIO_V1_SYMBOL,
    walletId: input.walletId ?? null,
    direction: input.direction,
    orderType: input.orderType,
    marginMode: input.marginMode,
    leverage: input.leverage,
    quantity: input.quantity,
    margin: input.margin,
    price: input.price,
    marketPrice: input.marketPrice,
    tpSlEnabled: input.tpSlEnabled,
    reduceOnlyEnabled: input.reduceOnlyEnabled,
    postOnlyEnabled: input.postOnlyEnabled ?? false,
    takeProfitPrice: input.takeProfitPrice ?? null,
    stopLossPrice: input.stopLossPrice ?? null,
  };
}
