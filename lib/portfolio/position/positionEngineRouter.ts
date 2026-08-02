import type { PerpAccountPositionMode } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import {
  accumulateHedgeRealizedPnL,
  aggregateHedgeLegMetrics,
  buildHedgePositions,
} from "@/lib/portfolio/hedge/hedgePositionEngine";
import {
  accumulatePositionFromTrades,
  buildPosition,
  buildPositions,
  type BuildPositionDefaults,
} from "@/lib/portfolio/positionEngine";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { Position, Trade } from "@/lib/portfolio/types";

export function buildPositionsForAccountMode(
  trades: Trade[],
  marketPrice: number,
  accountPositionMode: PerpAccountPositionMode,
  defaults: BuildPositionDefaults = {},
  symbol: string = PORTFOLIO_V1_SYMBOL,
): Position[] {
  if (accountPositionMode === "HEDGE") {
    return buildHedgePositions(trades, marketPrice, defaults, symbol);
  }
  return buildPositions(trades, marketPrice, defaults);
}

export function accumulateRealizedPnLForAccountMode(
  trades: Trade[],
  accountPositionMode: PerpAccountPositionMode,
): number {
  if (accountPositionMode === "HEDGE") {
    return accumulateHedgeRealizedPnL(trades);
  }
  return accumulatePositionFromTrades(trades).realizedPnL;
}

/** Wallet-level margin / uPnL aggregation for portfolio summary. */
export function aggregateOpenPositionMetrics(
  trades: Trade[],
  marketPrice: number,
  accountPositionMode: PerpAccountPositionMode,
  defaults: BuildPositionDefaults,
): {
  positions: Position[];
  unrealizedPnL: number;
  marginUsed: number;
  maintenanceMarginTotal: number;
  realizedPnL: number;
} {
  const positions = buildPositionsForAccountMode(
    trades,
    marketPrice,
    accountPositionMode,
    defaults,
  );
  const realizedPnL = accumulateRealizedPnLForAccountMode(trades, accountPositionMode);

  if (accountPositionMode === "HEDGE") {
    const agg = aggregateHedgeLegMetrics(positions);
    return { positions, ...agg, realizedPnL };
  }

  const position = buildPosition(trades, marketPrice, PORTFOLIO_V1_SYMBOL, defaults);
  return {
    positions,
    realizedPnL,
    unrealizedPnL: position && position.quantity !== 0 ? position.unrealizedPnL : 0,
    marginUsed: position && position.quantity !== 0 ? position.entryMargin : 0,
    maintenanceMarginTotal:
      position && position.quantity !== 0 ? position.maintenanceMargin : 0,
  };
}
