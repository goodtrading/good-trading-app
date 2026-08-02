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
import {
  isEffectivelyZero,
  normalizeQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import type { MarginMode, Position, Trade } from "@/lib/portfolio/types";

function sortTradesChronologically(trades: Trade[]): Trade[] {
  return [...trades].sort((left, right) => left.timestamp - right.timestamp);
}

export interface PositionAccumulator {
  quantity: number;
  costBasis: number;
  realizedPnL: number;
}

/**
 * Average-cost accumulator.
 * quantity > 0 → long, quantity < 0 → short.
 */
export function accumulatePositionFromTrades(trades: Trade[]): PositionAccumulator {
  const sorted = sortTradesChronologically(trades);
  let quantity = 0;
  let costBasis = 0;
  let realizedPnL = 0;

  for (const trade of sorted) {
    if (trade.side === "BUY") {
      if (quantity >= 0) {
        quantity += trade.quantity;
        costBasis += trade.quantity * trade.price;
        continue;
      }

      const shortQty = -quantity;
      const avgEntry = costBasis / shortQty;

      if (trade.quantity < shortQty) {
        realizedPnL += trade.quantity * (avgEntry - trade.price);
        costBasis -= trade.quantity * avgEntry;
        quantity += trade.quantity;
        continue;
      }

      realizedPnL += shortQty * (avgEntry - trade.price);
      const excess = trade.quantity - shortQty;
      quantity = excess;
      costBasis = excess > 0 ? excess * trade.price : 0;
      continue;
    }

    if (quantity <= 0) {
      quantity -= trade.quantity;
      costBasis += trade.quantity * trade.price;
      continue;
    }

    const avgEntry = costBasis / quantity;

    if (trade.quantity < quantity) {
      realizedPnL += trade.quantity * (trade.price - avgEntry);
      costBasis -= trade.quantity * avgEntry;
      quantity -= trade.quantity;
      continue;
    }

    if (trade.quantity === quantity) {
      realizedPnL += trade.quantity * (trade.price - avgEntry);
      quantity = 0;
      costBasis = 0;
      continue;
    }

    realizedPnL += quantity * (trade.price - avgEntry);
    const excess = trade.quantity - quantity;
    quantity = -excess;
    costBasis = excess * trade.price;
  }

  return { quantity, costBasis, realizedPnL };
}

export type BuildPositionDefaults = {
  leverage?: number;
  marginMode?: MarginMode;
  /** Wallet balance for cross-mode liquidation price. */
  walletBalance?: number;
};

export function buildPosition(
  trades: Trade[],
  marketPrice: number,
  symbol: string = PORTFOLIO_V1_SYMBOL,
  defaults: BuildPositionDefaults = {},
): Position | null {
  const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
  if (symbolTrades.length === 0) {
    return null;
  }

  const { quantity: rawQuantity, costBasis, realizedPnL } =
    accumulatePositionFromTrades(symbolTrades);
  const leverage = resolvePositionLeverage(symbolTrades, defaults.leverage ?? 1);
  const marginMode = resolvePositionMarginMode(
    symbolTrades,
    defaults.marginMode ?? "CROSS",
  );
  const walletBalance = defaults.walletBalance ?? 0;
  const wasLiquidated = symbolTrades.some((trade) => trade.liquidation === true);

  const quantity = isEffectivelyZero(symbol, Math.abs(rawQuantity))
    ? 0
    : rawQuantity > 0
      ? normalizeQuantity(symbol, rawQuantity)
      : -normalizeQuantity(symbol, Math.abs(rawQuantity));

  if (quantity === 0) {
    return {
      symbol,
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

  const avgEntry = costBasis / Math.abs(quantity);
  const entryMargin = entryMarginForPosition(quantity, avgEntry, leverage);
  const atMark = perpMetricsAtMark({
    quantity,
    avgEntry,
    leverage,
    entryMargin,
    markPrice: marketPrice,
  });
  const liquidation = computeLiquidationState({
    quantity,
    avgEntry,
    entryMargin,
    markPrice: marketPrice,
    leverage,
    marginMode,
    walletBalance,
  });

  return {
    symbol,
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

export function buildPositions(
  trades: Trade[],
  marketPrice: number,
  defaults: BuildPositionDefaults = {},
): Position[] {
  const position = buildPosition(trades, marketPrice, PORTFOLIO_V1_SYMBOL, defaults);
  return position && position.quantity !== 0 ? [position] : [];
}
