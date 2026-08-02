import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export class OcoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcoValidationError";
  }
}

function isTakeProfitOrder(order: OrderEntity): boolean {
  return (
    order.orderType === "TAKE_PROFIT_MARKET" || order.orderType === "TAKE_PROFIT_LIMIT"
  );
}

function isStopLossOrder(order: OrderEntity): boolean {
  return order.orderType === "STOP_MARKET" || order.orderType === "STOP_LIMIT";
}

export function assertReduceOnlyForOco(order: OrderEntity): void {
  if (!order.reduceOnly) {
    throw new OcoValidationError("OCO orders must be reduce-only");
  }
}

/** Validates a TP + SL pair before group creation. */
export function validateOcoOrderPair(input: {
  takeProfit: OrderEntity;
  stopLoss: OrderEntity;
  positionSide: PositionSide;
}): void {
  const { takeProfit, stopLoss, positionSide } = input;

  if (takeProfit.walletId !== stopLoss.walletId) {
    throw new OcoValidationError("OCO orders must share the same wallet");
  }
  if (takeProfit.symbol !== stopLoss.symbol) {
    throw new OcoValidationError("OCO orders must share the same symbol");
  }
  if (takeProfit.direction !== positionSide || stopLoss.direction !== positionSide) {
    throw new OcoValidationError("OCO orders must match the position leg");
  }
  if (!isTakeProfitOrder(takeProfit)) {
    throw new OcoValidationError("OCO take-profit leg has invalid order type");
  }
  if (!isStopLossOrder(stopLoss)) {
    throw new OcoValidationError("OCO stop-loss leg has invalid order type");
  }

  assertReduceOnlyForOco(takeProfit);
  assertReduceOnlyForOco(stopLoss);

  if (takeProfit.positionId == null || stopLoss.positionId == null) {
    throw new OcoValidationError("OCO orders must be linked to a position");
  }
  if (takeProfit.positionId !== stopLoss.positionId) {
    throw new OcoValidationError("OCO orders must share the same positionId");
  }
}

/** Returns true only when both legs exist — never create a group for a single order. */
export function canCreateOcoGroup(
  takeProfit: OrderEntity | null | undefined,
  stopLoss: OrderEntity | null | undefined,
): takeProfit is OrderEntity {
  return takeProfit != null && stopLoss != null;
}
