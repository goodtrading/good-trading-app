import type { MarginMode, TradeDirection } from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { ExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidity";
import { DEFAULT_EXECUTION_LIQUIDITY } from "@/lib/portfolio/execution/ExecutionLiquidity";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

/**
 * Formal order lifecycle. Orders are never deleted — only transitioned.
 *
 * PENDING → PARTIALLY_FILLED → FILLED
 * PENDING → CANCELLED | REJECTED
 * PARTIALLY_FILLED → FILLED | CANCELLED
 */
export const ORDER_STATUSES = [
  "PENDING",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Order kinds evaluated by OrderPriceEvaluator via orderType only.
 * LIMIT — entry pending
 * STOP_* — stop-loss style (adverse move)
 * TAKE_PROFIT_* — take-profit style (favorable move)
 */
export const REGISTERED_ORDER_TYPES = [
  "LIMIT",
  "STOP_MARKET",
  "STOP_LIMIT",
  "TAKE_PROFIT_MARKET",
  "TAKE_PROFIT_LIMIT",
] as const;

export type RegisteredOrderType = (typeof REGISTERED_ORDER_TYPES)[number];

export type OrderSide = "BUY" | "SELL";

export type OrderEntity = {
  id: string;
  walletId: string;
  symbol: string;
  side: OrderSide;
  direction: TradeDirection;
  orderType: RegisteredOrderType;
  marginMode: MarginMode;
  leverage: number;
  /** Price that triggers evaluation (limit / stop / tp trigger). */
  triggerPrice: number;
  quantity: number;
  margin: number;
  createdAt: number;
  updatedAt: number;
  status: OrderStatus;
  /**
   * Links TP/SL (and future reduce orders) to an open position.
   * Format: `${walletId}:${symbol}` (one-way) or `${walletId}:${symbol}:${side}` (hedge).
   */
  positionId: string | null;
  /** Optional limit price after stop trigger (STOP_LIMIT / TP_LIMIT). */
  limitPrice: number | null;
  ocoGroupId?: string | null;
  reduceOnly: boolean;
  postOnly: boolean;
  executionLiquidity: ExecutionLiquidity;
  filledAt: number | null;
  rejectedReason: string | null;
};

export type RegisterOrderInput = {
  walletId: string;
  symbol: string;
  side: OrderSide;
  direction: TradeDirection;
  orderType: RegisteredOrderType;
  marginMode: MarginMode;
  leverage: number;
  triggerPrice: number;
  quantity: number;
  margin: number;
  positionId?: string | null;
  ocoGroupId?: string | null;
  limitPrice?: number | null;
  reduceOnly?: boolean;
  postOnly?: boolean;
  executionLiquidity?: ExecutionLiquidity;
};

export function hydrateOrderEntity(order: OrderEntity): OrderEntity {
  return {
    ...order,
    reduceOnly: order.reduceOnly ?? false,
    postOnly: order.postOnly ?? false,
    executionLiquidity: order.executionLiquidity ?? DEFAULT_EXECUTION_LIQUIDITY,
    limitPrice: order.limitPrice ?? null,
    positionId: order.positionId ?? null,
    ocoGroupId: order.ocoGroupId ?? null,
    filledAt: order.filledAt ?? null,
    rejectedReason: order.rejectedReason ?? null,
  };
}

export function createOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPositionId(
  walletId: string,
  symbol: string,
  positionSide?: PositionSide | null,
): string {
  if (positionSide === "LONG" || positionSide === "SHORT") {
    return `${walletId}:${symbol}:${positionSide}`;
  }
  return `${walletId}:${symbol}`;
}

export function isOpenOrderStatus(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PARTIALLY_FILLED";
}

/** UI badge label derived solely from orderType. */
export type OrderBadgeKind =
  | "LIMIT"
  | "STOP"
  | "STOP LIMIT"
  | "TP"
  | "TP LIMIT"
  | "SL";

export function orderBadgeKind(orderType: RegisteredOrderType): OrderBadgeKind {
  switch (orderType) {
    case "LIMIT":
      return "LIMIT";
    case "STOP_MARKET":
      return "SL";
    case "STOP_LIMIT":
      return "STOP LIMIT";
    case "TAKE_PROFIT_MARKET":
      return "TP";
    case "TAKE_PROFIT_LIMIT":
      return "TP LIMIT";
    default:
      return "STOP";
  }
}
