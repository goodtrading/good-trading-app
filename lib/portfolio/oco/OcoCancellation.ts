import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import type { TradeTriggerReason } from "@/lib/portfolio/oco/OcoGroup";
import { ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export type { TradeTriggerReason };

/** Resolves trigger reason from a registered order fill. */
export function resolveTriggerReasonFromOrder(order: OrderEntity): TradeTriggerReason {
  if (
    order.orderType === "TAKE_PROFIT_MARKET" ||
    order.orderType === "TAKE_PROFIT_LIMIT"
  ) {
    return "TAKE_PROFIT";
  }
  if (order.orderType === "STOP_MARKET" || order.orderType === "STOP_LIMIT") {
    return "STOP_LOSS";
  }
  return "MANUAL";
}

/**
 * After one OCO leg fills: cancel the counterpart immediately and complete the group.
 * Never allows both legs to execute.
 */
export async function cancelOcoCounterpartOnFill(
  walletId: string,
  filledOrder: OrderEntity,
): Promise<OrderEntity[]> {
  const group = await ocoRuntime.findByOrderId(walletId, filledOrder.id);
  if (group == null || group.status === "COMPLETED" || group.status === "CANCELLED") {
    return [];
  }

  const counterpartId =
    filledOrder.id === group.takeProfitOrderId
      ? group.stopLossOrderId
      : group.takeProfitOrderId;

  const cancelled: OrderEntity[] = [];
  const counterpart = await orderRegistryEngine.getById(walletId, counterpartId);
  if (counterpart != null && (counterpart.status === "PENDING" || counterpart.status === "PARTIALLY_FILLED")) {
    cancelled.push(await orderRegistryEngine.cancel(walletId, counterpartId));
  }

  await ocoRuntime.transition(walletId, group.id, "COMPLETED");
  return cancelled;
}

/** When the user cancels one OCO leg manually, cancel the other and mark group CANCELLED. */
export async function cancelOcoCounterpartOnManualCancel(
  walletId: string,
  cancelledOrderId: string,
): Promise<OrderEntity[]> {
  const group = await ocoRuntime.findByOrderId(walletId, cancelledOrderId);
  if (group == null || group.status === "COMPLETED" || group.status === "CANCELLED") {
    return [];
  }

  const counterpartId =
    cancelledOrderId === group.takeProfitOrderId
      ? group.stopLossOrderId
      : group.takeProfitOrderId;

  const cancelled: OrderEntity[] = [];
  const counterpart = await orderRegistryEngine.getById(walletId, counterpartId);
  if (counterpart != null && (counterpart.status === "PENDING" || counterpart.status === "PARTIALLY_FILLED")) {
    cancelled.push(await orderRegistryEngine.cancel(walletId, counterpartId));
  }

  await ocoRuntime.transition(walletId, group.id, "CANCELLED");
  return cancelled;
}

/** Cancels active OCO groups when a position leg disappears. */
export async function cancelOcoGroupsForFlatPositionLeg(
  walletId: string,
  symbol: string,
  positionSide: PositionSide,
): Promise<OrderEntity[]> {
  await ocoRuntime.cancelActiveForPositionLeg(walletId, symbol, positionSide);

  const open = await orderRegistryEngine.listOpen(walletId);
  const cancelled: OrderEntity[] = [];
  for (const order of open) {
    if (order.symbol !== symbol) continue;
    if (order.direction !== positionSide) continue;
    if (
      order.orderType === "TAKE_PROFIT_MARKET" ||
      order.orderType === "TAKE_PROFIT_LIMIT" ||
      order.orderType === "STOP_MARKET" ||
      order.orderType === "STOP_LIMIT"
    ) {
      cancelled.push(await orderRegistryEngine.cancel(walletId, order.id));
    }
  }
  return cancelled;
}
