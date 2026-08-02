import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  entryMarginForPosition,
  perpMetricsAtMark,
  resolvePositionLeverage,
  resolvePositionMarginMode,
} from "@/lib/portfolio/futures/futuresAccounting";
import {
  computeLiquidationState,
  computePositionMarginRatio,
} from "@/lib/portfolio/futures/MarginModel";
import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import { resolveTradePositionSide, signedQuantityForLeg } from "@/lib/portfolio/hedge/resolvePositionSide";
import type { BuildPositionDefaults } from "@/lib/portfolio/positionEngine";
import { sortTradesChronologically } from "@/lib/portfolio/tradeEngine";
import {
  isEffectivelyZero,
  normalizeQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import type { MarginMode, Position, Trade } from "@/lib/portfolio/types";

export type HedgeLegAccumulator = {
  quantity: number;
  costBasis: number;
  realizedPnL: number;
};

/**
 * Average-cost accumulator within a single hedge leg (quantity never flips across legs).
 * LONG leg: BUY opens/adds, SELL reduces.
 * SHORT leg: SELL opens/adds, BUY reduces.
 */
export function accumulateLegFromTrades(
  trades: Trade[],
  leg: PositionSide,
): HedgeLegAccumulator {
  const sorted = sortTradesChronologically(trades);
  let quantity = 0;
  let costBasis = 0;
  let realizedPnL = 0;

  for (const trade of sorted) {
    if (resolveTradePositionSide(trade) !== leg) continue;

    const opens =
      (leg === "LONG" && trade.side === "BUY") || (leg === "SHORT" && trade.side === "SELL");
    const reduces =
      (leg === "LONG" && trade.side === "SELL") || (leg === "SHORT" && trade.side === "BUY");

    if (opens) {
      quantity += trade.quantity;
      costBasis += trade.quantity * trade.price;
      continue;
    }

    if (!reduces || quantity <= 0) {
      continue;
    }

    const avgEntry = costBasis / quantity;
    const closed = Math.min(trade.quantity, quantity);
    realizedPnL +=
      leg === "LONG"
        ? closed * (trade.price - avgEntry)
        : closed * (avgEntry - trade.price);
    costBasis -= closed * avgEntry;
    quantity -= closed;
  }

  return { quantity, costBasis, realizedPnL };
}

export function accumulateHedgeRealizedPnL(trades: Trade[]): number {
  return (
    accumulateLegFromTrades(trades, "LONG").realizedPnL +
    accumulateLegFromTrades(trades, "SHORT").realizedPnL
  );
}

function buildLegPosition(
  trades: Trade[],
  leg: PositionSide,
  marketPrice: number,
  symbol: string,
  defaults: BuildPositionDefaults,
): Position | null {
  const legTrades = trades.filter((t) => t.symbol === symbol);
  if (legTrades.length === 0) return null;

  const { quantity: rawQty, costBasis, realizedPnL } = accumulateLegFromTrades(legTrades, leg);
  const leverage = resolvePositionLeverage(legTrades, defaults.leverage ?? 1);
  const marginMode = resolvePositionMarginMode(legTrades, defaults.marginMode ?? "CROSS");
  const walletBalance = defaults.walletBalance ?? 0;
  const wasLiquidated = legTrades.some((t) => t.liquidation === true);

  const quantity = isEffectivelyZero(symbol, rawQty)
    ? 0
    : normalizeQuantity(symbol, rawQty);

  if (quantity === 0) {
    if (realizedPnL === 0 && !wasLiquidated) return null;
    return {
      symbol,
      side: leg,
      quantity: 0,
      avgEntry: 0,
      marketPrice,
      markPrice: marketPrice,
      marginMode,
      leverage,
      entryMargin: 0,
      maintenanceMargin: 0,
      liquidationPrice: null,
      positionValue: 0,
      unrealizedPnL: 0,
      realizedPnL,
      roiPercent: 0,
      marginRatio: 0,
      status: wasLiquidated ? "LIQUIDATED" : "OPEN",
    };
  }

  const avgEntry = costBasis / quantity;
  const signedQty = signedQuantityForLeg(leg, quantity);
  const entryMargin = entryMarginForPosition(signedQty, avgEntry, leverage);
  const atMark = perpMetricsAtMark({
    quantity: signedQty,
    avgEntry,
    leverage,
    entryMargin,
    markPrice: marketPrice,
  });
  const liquidation = computeLiquidationState({
    quantity: signedQty,
    avgEntry,
    entryMargin,
    markPrice: marketPrice,
    leverage,
    marginMode,
    walletBalance,
  });

  return {
    symbol,
    side: leg,
    quantity,
    avgEntry,
    marketPrice,
    markPrice: marketPrice,
    marginMode,
    leverage,
    entryMargin,
    maintenanceMargin: atMark.maintenanceMargin,
    liquidationPrice: liquidation.liquidationPrice,
    positionValue: atMark.positionValue,
    unrealizedPnL: atMark.unrealizedPnL,
    realizedPnL,
    roiPercent: atMark.roiPercent,
    marginRatio: computePositionMarginRatio({
      maintenanceMargin: atMark.maintenanceMargin,
      entryMargin,
      unrealizedPnL: atMark.unrealizedPnL,
    }),
    status: "OPEN",
  };
}

/** Builds independent LONG and SHORT legs — never nets across sides. */
export function buildHedgePositions(
  trades: Trade[],
  marketPrice: number,
  defaults: BuildPositionDefaults = {},
  symbol: string = PORTFOLIO_V1_SYMBOL,
): Position[] {
  const symbolTrades = trades.filter((t) => t.symbol === symbol);
  if (symbolTrades.length === 0) return [];

  const legs: Position[] = [];
  for (const side of ["LONG", "SHORT"] as const) {
    const leg = buildLegPosition(symbolTrades, side, marketPrice, symbol, defaults);
    if (leg != null && leg.quantity !== 0) {
      legs.push(leg);
    }
  }
  return legs;
}

export function aggregateHedgeLegMetrics(positions: Position[]): {
  unrealizedPnL: number;
  marginUsed: number;
  maintenanceMarginTotal: number;
  realizedPnL: number;
} {
  return positions.reduce(
    (acc, leg) => ({
      unrealizedPnL: acc.unrealizedPnL + leg.unrealizedPnL,
      marginUsed: acc.marginUsed + leg.entryMargin,
      maintenanceMarginTotal: acc.maintenanceMarginTotal + leg.maintenanceMargin,
      realizedPnL: acc.realizedPnL + leg.realizedPnL,
    }),
    { unrealizedPnL: 0, marginUsed: 0, maintenanceMarginTotal: 0, realizedPnL: 0 },
  );
}

export function findHedgeLegPosition(
  positions: Position[],
  symbol: string,
  side: PositionSide,
): Position | undefined {
  return positions.find((p) => p.symbol === symbol && p.side === side);
}
