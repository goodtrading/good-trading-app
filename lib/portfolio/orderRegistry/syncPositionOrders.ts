import {
  buildPositionId,
  type OrderEntity,
} from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { resolveTargetLegFromExecution } from "@/lib/portfolio/hedge/resolveReduceOnlyContext";
import { resolvePositionDisplaySide } from "@/lib/portfolio/hedge/resolvePositionSide";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import { tryBuildOcoGroupFromRegistered } from "@/lib/portfolio/oco/OcoGroupBuilder";
import { cancelOcoGroupsForFlatPositionLeg } from "@/lib/portfolio/oco/OcoCancellation";
import { ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import { trailingStopRuntime } from "@/lib/portfolio/trailing/TrailingStopRuntime";
import type { TradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";

async function resolveLegPosition(
  engine: PortfolioEngine,
  symbol: string,
  marketPrice: number,
  leg: PositionSide,
) {
  const positions = await engine.getPositions(marketPrice);
  if (engine.getAccountPositionMode() === "HEDGE") {
    return positions.find((p) => p.symbol === symbol && p.side === leg) ?? null;
  }
  const position = positions.find((p) => p.symbol === symbol);
  if (position == null || position.quantity === 0) return null;
  const displaySide = resolvePositionDisplaySide(position);
  if (displaySide !== leg) return null;
  return position;
}

async function persistOcoGroupForRegisteredOrders(
  walletId: string,
  registered: OrderEntity[],
  positionSide: PositionSide,
) {
  const group = tryBuildOcoGroupFromRegistered(registered, positionSide);
  if (group == null) {
    return null;
  }

  await ocoRuntime.cancelActiveForPositionLeg(walletId, group.symbol, positionSide);
  const persisted = await ocoRuntime.persist(walletId, group);
  await orderRegistryEngine.attachOcoGroupId(walletId, persisted.takeProfitOrderId, persisted.id);
  await orderRegistryEngine.attachOcoGroupId(walletId, persisted.stopLossOrderId, persisted.id);
  return persisted;
}

/**
 * Cancels open TP/SL (and any linked orders) when the position leg is flat.
 * Never deletes — status becomes CANCELLED.
 */
export async function cancelLinkedOrdersIfPositionFlat(
  engine: PortfolioEngine,
  walletId: string,
  symbol: string,
  marketPrice: number,
  direction?: "LONG" | "SHORT",
): Promise<OrderEntity[]> {
  const hedge = engine.getAccountPositionMode() === "HEDGE";

  if (hedge && direction != null) {
    const leg = resolveTargetLegFromExecution({ direction, reduceOnly: false });
    const position = await resolveLegPosition(engine, symbol, marketPrice, leg);
    if (position != null && position.quantity !== 0) {
      return [];
    }
    const positionId = buildPositionId(walletId, symbol, leg);
    const cancelledOrders = await orderRegistryEngine.cancelOpenForPosition(walletId, positionId);
    const cancelledOco = await cancelOcoGroupsForFlatPositionLeg(walletId, symbol, leg);
    await trailingStopRuntime.cancelActiveForPositionLeg(walletId, symbol, leg);
    return [...cancelledOrders, ...cancelledOco];
  }

  const positions = await engine.getPositions(marketPrice);
  const position = positions.find((p) => p.symbol === symbol);
  if (position != null && position.quantity !== 0) {
    return [];
  }

  const positionId = buildPositionId(walletId, symbol);
  const cancelledOrders = await orderRegistryEngine.cancelOpenForPosition(walletId, positionId);
  const leg = direction ?? (position != null ? resolvePositionDisplaySide(position) : null);
  let cancelledOco: OrderEntity[] = [];
  if (leg != null) {
    cancelledOco = await cancelOcoGroupsForFlatPositionLeg(walletId, symbol, leg);
    await trailingStopRuntime.cancelActiveForPositionLeg(walletId, symbol, leg);
  } else {
    cancelledOco = (
      await Promise.all([
        cancelOcoGroupsForFlatPositionLeg(walletId, symbol, "LONG"),
        cancelOcoGroupsForFlatPositionLeg(walletId, symbol, "SHORT"),
      ])
    ).flat();
    await Promise.all([
      trailingStopRuntime.cancelActiveForPositionLeg(walletId, symbol, "LONG"),
      trailingStopRuntime.cancelActiveForPositionLeg(walletId, symbol, "SHORT"),
    ]);
  }
  return [...cancelledOrders, ...cancelledOco];
}

/**
 * After a MARKET open, register TP and/or SL as PENDING OrderEntity rows
 * linked via positionId. Does not execute — OrderPriceEvaluator fills later.
 */
export async function registerTpSlForOpenPosition(
  engine: PortfolioEngine,
  request: TradeExecutionRequest,
): Promise<OrderEntity[]> {
  if (!request.walletId || !request.tpSlEnabled) {
    return [];
  }

  const hasTp = request.takeProfitPrice != null && request.takeProfitPrice > 0;
  const hasSl = request.stopLossPrice != null && request.stopLossPrice > 0;
  if (!hasTp && !hasSl) {
    return [];
  }

  const hedge = engine.getAccountPositionMode() === "HEDGE";
  const leg = resolveTargetLegFromExecution({
    direction: request.direction,
    reduceOnly: request.reduceOnlyEnabled,
  });
  const position = hedge
    ? await resolveLegPosition(engine, request.symbol, request.marketPrice, leg)
    : (await engine.getPositions(request.marketPrice)).find(
        (p) => p.symbol === request.symbol,
      ) ?? null;

  if (position == null || position.quantity === 0) {
    return [];
  }

  const displaySide = resolvePositionDisplaySide(position);
  const positionId = buildPositionId(
    request.walletId,
    request.symbol,
    hedge ? displaySide : null,
  );
  const closeSide = displaySide === "LONG" ? "SELL" : "BUY";
  const direction = displaySide;
  const quantity = Math.abs(position.quantity);

  await orderRegistryEngine.cancelOpenForPosition(request.walletId, positionId);
  await ocoRuntime.cancelActiveForPositionLeg(request.walletId, request.symbol, displaySide);

  const registered: OrderEntity[] = [];

  if (hasTp) {
    registered.push(
      await orderRegistryEngine.register({
        walletId: request.walletId,
        symbol: request.symbol,
        side: closeSide,
        direction,
        orderType: "TAKE_PROFIT_MARKET",
        marginMode: request.marginMode,
        leverage: request.leverage,
        triggerPrice: request.takeProfitPrice!,
        quantity,
        margin: request.margin,
        positionId,
        reduceOnly: true,
      }),
    );
  }

  if (hasSl) {
    registered.push(
      await orderRegistryEngine.register({
        walletId: request.walletId,
        symbol: request.symbol,
        side: closeSide,
        direction,
        orderType: "STOP_MARKET",
        marginMode: request.marginMode,
        leverage: request.leverage,
        triggerPrice: request.stopLossPrice!,
        quantity,
        margin: request.margin,
        positionId,
        reduceOnly: true,
      }),
    );
  }

  await persistOcoGroupForRegisteredOrders(request.walletId, registered, displaySide);
  return registered;
}

export type ReplacePositionTpSlInput = {
  walletId: string;
  symbol: string;
  marginMode: OrderEntity["marginMode"];
  leverage: number;
  quantity: number;
  margin: number;
  /** Positive qty = long, negative = short (one-way). Hedge: use positionSide instead. */
  signedQuantity: number;
  positionSide?: PositionSide | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
};

/**
 * Replaces open TP/SL for a live position via OrderRegistryEngine only.
 * Pass null prices to remove that leg (cancel without re-register).
 */
export async function replacePositionTpSl(
  input: ReplacePositionTpSlInput,
): Promise<OrderEntity[]> {
  const hedgeLeg =
    input.positionSide === "LONG" || input.positionSide === "SHORT"
      ? input.positionSide
      : null;
  const positionId = buildPositionId(input.walletId, input.symbol, hedgeLeg);
  await orderRegistryEngine.cancelOpenForPosition(input.walletId, positionId);

  const signedQty = hedgeLeg
    ? hedgeLeg === "LONG"
      ? input.quantity
      : -input.quantity
    : input.signedQuantity;

  if (signedQty === 0) {
    if (hedgeLeg) {
      await ocoRuntime.cancelActiveForPositionLeg(input.walletId, input.symbol, hedgeLeg);
    }
    return [];
  }

  const closeSide = signedQty > 0 ? "SELL" : "BUY";
  const direction = signedQty > 0 ? "LONG" : "SHORT";
  const quantity = Math.abs(input.quantity);
  const registered: OrderEntity[] = [];

  await ocoRuntime.cancelActiveForPositionLeg(input.walletId, input.symbol, direction);

  if (input.takeProfitPrice != null && input.takeProfitPrice > 0) {
    registered.push(
      await orderRegistryEngine.register({
        walletId: input.walletId,
        symbol: input.symbol,
        side: closeSide,
        direction,
        orderType: "TAKE_PROFIT_MARKET",
        marginMode: input.marginMode,
        leverage: input.leverage,
        triggerPrice: input.takeProfitPrice,
        quantity,
        margin: input.margin,
        positionId,
        reduceOnly: true,
      }),
    );
  }

  if (input.stopLossPrice != null && input.stopLossPrice > 0) {
    registered.push(
      await orderRegistryEngine.register({
        walletId: input.walletId,
        symbol: input.symbol,
        side: closeSide,
        direction,
        orderType: "STOP_MARKET",
        marginMode: input.marginMode,
        leverage: input.leverage,
        triggerPrice: input.stopLossPrice,
        quantity,
        margin: input.margin,
        positionId,
        reduceOnly: true,
      }),
    );
  }

  await persistOcoGroupForRegisteredOrders(input.walletId, registered, direction);
  return registered;
}
