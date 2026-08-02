import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { buildSpotPositionId } from "@/lib/portfolio/spot/spotSymbol";
import type { SpotOrder } from "@/lib/portfolio/spot/types";

/** UI view adapter — does not write to PERP OrderRegistryEngine. */
export function spotOrderToViewEntity(order: SpotOrder): OrderEntity {
  const purpose = order.purpose ?? "TRADE";
  const positionAsset = order.positionAsset ?? null;

  let mappedOrderType: OrderEntity["orderType"] = "LIMIT";
  if (purpose === "TAKE_PROFIT") {
    mappedOrderType = "TAKE_PROFIT_LIMIT";
  } else if (purpose === "STOP_LOSS") {
    mappedOrderType = "STOP_MARKET";
  } else if (order.orderType === "STOP") {
    mappedOrderType = "STOP_MARKET";
  }

  const status =
    order.status === "PENDING" ||
    order.status === "PARTIALLY_FILLED" ||
    order.status === "FILLED" ||
    order.status === "CANCELLED" ||
    order.status === "REJECTED"
      ? order.status
      : "CANCELLED";

  return {
    id: order.id,
    walletId: order.walletId,
    symbol: `${order.baseAsset}${order.quoteAsset}`,
    side: order.side,
    direction: order.side === "BUY" ? "LONG" : "SHORT",
    orderType: mappedOrderType,
    marginMode: "CROSS",
    leverage: 1,
    triggerPrice: order.triggerPrice ?? 0,
    quantity: order.quantity,
    margin: 0,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status,
    positionId: positionAsset
      ? buildSpotPositionId(order.walletId, positionAsset)
      : null,
    limitPrice: order.triggerPrice,
    reduceOnly: false,
    filledAt: order.status === "FILLED" ? order.updatedAt : null,
    rejectedReason: null,
  };
}
