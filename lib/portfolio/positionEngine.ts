import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { sortTradesChronologically } from "@/lib/portfolio/tradeEngine";
import type { Position, Trade } from "@/lib/portfolio/types";

export interface PositionAccumulator {
  quantity: number;
  costBasis: number;
  realizedPnL: number;
}

export function accumulatePositionFromTrades(trades: Trade[]): PositionAccumulator {
  const sorted = sortTradesChronologically(trades);
  let quantity = 0;
  let costBasis = 0;
  let realizedPnL = 0;

  for (const trade of sorted) {
    if (trade.side === "BUY") {
      quantity += trade.quantity;
      costBasis += trade.quantity * trade.price;
      continue;
    }

    if (quantity <= 0) {
      throw new Error("Cannot sell without an open long position in V1");
    }

    if (trade.quantity > quantity) {
      throw new Error("Insufficient position quantity for sell");
    }

    const avgEntry = costBasis / quantity;
    realizedPnL += trade.quantity * (trade.price - avgEntry);
    costBasis -= trade.quantity * avgEntry;
    quantity -= trade.quantity;
  }

  return { quantity, costBasis, realizedPnL };
}

export function buildPosition(
  trades: Trade[],
  marketPrice: number,
  symbol: string = PORTFOLIO_V1_SYMBOL,
): Position | null {
  const symbolTrades = trades.filter((trade) => trade.symbol === symbol);
  if (symbolTrades.length === 0) {
    return null;
  }

  const { quantity, costBasis, realizedPnL } = accumulatePositionFromTrades(symbolTrades);
  const avgEntry = quantity > 0 ? costBasis / quantity : 0;
  const unrealizedPnL = quantity > 0 ? quantity * (marketPrice - avgEntry) : 0;

  return {
    symbol,
    quantity,
    avgEntry,
    marketPrice,
    unrealizedPnL,
    realizedPnL,
  };
}

export function buildPositions(trades: Trade[], marketPrice: number): Position[] {
  const position = buildPosition(trades, marketPrice);
  return position && position.quantity > 0 ? [position] : [];
}
