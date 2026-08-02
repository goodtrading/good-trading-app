import {
  createOcoGroupId,
  type OcoGroup,
} from "@/lib/portfolio/oco/OcoGroup";
import {
  canCreateOcoGroup,
  validateOcoOrderPair,
} from "@/lib/portfolio/oco/OcoValidator";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export function buildOcoGroupFromOrders(input: {
  takeProfit: OrderEntity;
  stopLoss: OrderEntity;
  positionSide: PositionSide;
}): OcoGroup {
  validateOcoOrderPair(input);
  const now = Date.now();
  return {
    id: createOcoGroupId(),
    walletId: input.takeProfit.walletId,
    symbol: input.takeProfit.symbol,
    positionSide: input.positionSide,
    takeProfitOrderId: input.takeProfit.id,
    stopLossOrderId: input.stopLoss.id,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an OCO group when both TP and SL orders were registered.
 * Returns null if only one leg exists.
 */
export function tryBuildOcoGroupFromRegistered(
  orders: OrderEntity[],
  positionSide: PositionSide,
): OcoGroup | null {
  const tp = orders.find(
    (o) => o.orderType === "TAKE_PROFIT_MARKET" || o.orderType === "TAKE_PROFIT_LIMIT",
  );
  const sl = orders.find(
    (o) => o.orderType === "STOP_MARKET" || o.orderType === "STOP_LIMIT",
  );
  if (!canCreateOcoGroup(tp, sl)) {
    return null;
  }
  return buildOcoGroupFromOrders({ takeProfit: tp, stopLoss: sl, positionSide });
}
