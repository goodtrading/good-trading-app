import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import type { Trade, TradeSide } from "@/lib/portfolio/types";

/**
 * Resolves the hedge leg for a trade.
 * Uses persisted `positionSide` when present; otherwise infers from side + reduceOnly.
 */
export function resolveTradePositionSide(trade: Pick<Trade, "side" | "reduceOnly" | "positionSide">): PositionSide {
  if (trade.positionSide === "LONG" || trade.positionSide === "SHORT") {
    return trade.positionSide;
  }
  return inferPositionSideFromExecution({
    side: trade.side,
    reduceOnly: trade.reduceOnly,
  });
}

/** Maps execution to hedge leg before persistence. */
export function inferPositionSideFromExecution(input: {
  side: TradeSide;
  reduceOnly?: boolean;
}): PositionSide {
  if (input.reduceOnly) {
    return input.side === "SELL" ? "LONG" : "SHORT";
  }
  return input.side === "BUY" ? "LONG" : "SHORT";
}

/** Signed quantity for funding / legacy one-way helpers from a hedge leg. */
export function signedQuantityForLeg(side: PositionSide, quantity: number): number {
  return side === "LONG" ? quantity : -quantity;
}

/** Resolves display side from a position (hedge or one-way net). */
export function resolvePositionDisplaySide(position: {
  side?: PositionSide;
  quantity: number;
}): PositionSide {
  if (position.side === "LONG" || position.side === "SHORT") {
    return position.side;
  }
  return position.quantity >= 0 ? "LONG" : "SHORT";
}

export function absolutePositionQuantity(position: { quantity: number }): number {
  return Math.abs(position.quantity);
}
