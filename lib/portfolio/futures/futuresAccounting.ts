import type { MarginMode, Position, Trade } from "@/lib/portfolio/types";

import {
  computeAccountMarginRatio,
  computeAvailableBalance,
  computeEquity,
  computeEquityAtRisk,
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
  isLiquidationTriggered,
  MAINTENANCE_MARGIN_RATE,
  maintenanceMarginForNotional,
} from "@/lib/portfolio/futures/MarginModel";

export {
  computeAccountMarginRatio,
  computeAvailableBalance,
  computeEquity,
  computeEquityAtRisk,
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
  isLiquidationTriggered,
  MAINTENANCE_MARGIN_RATE,
  maintenanceMarginForNotional,
};
export type { LiquidationState, WalletState } from "@/lib/portfolio/futures/MarginModel";

/** Binance-style futures paper: leverage 1–125. */
export const MAX_LEVERAGE = 125;

/**
 * Wallet balance = mutable wallet cash + realized PnL.
 * Opening a futures position does not spend notional — only locks margin.
 */
export function calculateWalletBalance(
  walletCash: number,
  realizedPnL: number,
): number {
  return walletCash + realizedPnL;
}

/** Resolve mutable wallet cash from persisted state (legacy fallback). */
export function resolveWalletCash(persisted: {
  initialCashBalance: number;
  walletCash?: number;
}): number {
  return persisted.walletCash ?? persisted.initialCashBalance;
}

export function initialMarginForNotional(notional: number, leverage: number): number {
  if (!Number.isFinite(notional) || notional <= 0) return 0;
  const lev = Math.max(1, leverage);
  return notional / lev;
}

export function entryMarginForPosition(
  quantity: number,
  avgEntry: number,
  leverage: number,
): number {
  return initialMarginForNotional(Math.abs(quantity) * avgEntry, leverage);
}

/** @deprecated Use computeAvailableBalance from MarginModel. */
export function calculateAvailableBalance(args: {
  walletBalance: number;
  marginUsed: number;
  unrealizedPnL: number;
  marginMode: MarginMode;
}): number {
  return computeAvailableBalance(args);
}

/** @deprecated Use computeEquity from MarginModel. */
export function calculateEquity(walletBalance: number, unrealizedPnL: number): number {
  return computeEquity(walletBalance, unrealizedPnL);
}

/** @deprecated Use computeEquityAtRisk from MarginModel. */
export function equityAtRisk(args: {
  marginMode: MarginMode;
  entryMargin: number;
  unrealizedPnL: number;
  accountEquity: number;
}): number {
  return computeEquityAtRisk(args);
}

/** @deprecated Use computeLiquidationState().liquidationPrice */
export function computeFuturesLiquidationPrice(
  quantity: number,
  avgEntry: number,
  leverage: number,
  walletBalance = 0,
  marginMode: MarginMode = "ISOLATED",
): number | null {
  if (leverage <= 1 || quantity === 0 || avgEntry <= 0) return null;
  const entryMargin = entryMarginForPosition(quantity, avgEntry, leverage);
  return computeLiquidationState({
    quantity,
    avgEntry,
    entryMargin,
    markPrice: avgEntry,
    leverage,
    marginMode,
    walletBalance,
  }).liquidationPrice;
}

export function resolvePositionLeverage(
  trades: Trade[],
  fallback: number,
): number {
  for (let i = trades.length - 1; i >= 0; i -= 1) {
    const lev = trades[i]?.leverage;
    if (lev != null && lev > 0) return lev;
  }
  return fallback > 0 ? fallback : 1;
}

export function resolvePositionMarginMode(
  trades: Trade[],
  fallback: MarginMode,
): MarginMode {
  for (let i = trades.length - 1; i >= 0; i -= 1) {
    const mode = trades[i]?.marginMode;
    if (mode === "CROSS" || mode === "ISOLATED") return mode;
  }
  return fallback;
}

export function roiPercent(unrealizedPnL: number, entryMargin: number): number {
  if (entryMargin <= 0 || !Number.isFinite(entryMargin) || !Number.isFinite(unrealizedPnL)) {
    return 0;
  }
  const raw = (unrealizedPnL / entryMargin) * 100;
  if (!Number.isFinite(raw)) return 0;
  const capped = Math.max(-99_999_999, Math.min(99_999_999, raw));
  const rounded = Number(capped.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Live PERP mark metrics — position sizing only; ratios/liquidation via MarginModel. */
export function perpMetricsAtMark(args: {
  quantity: number;
  avgEntry: number;
  leverage: number;
  entryMargin: number;
  markPrice: number;
}): {
  positionValue: number;
  unrealizedPnL: number;
  maintenanceMargin: number;
  positionEquity: number;
  roiPercent: number;
} {
  const { quantity, avgEntry, entryMargin, markPrice } = args;

  if (quantity === 0 || !(markPrice > 0) || !(avgEntry > 0)) {
    return {
      positionValue: 0,
      unrealizedPnL: 0,
      maintenanceMargin: 0,
      positionEquity: 0,
      roiPercent: 0,
    };
  }

  const unrealizedPnL = quantity * (markPrice - avgEntry);
  const positionValue = Math.abs(quantity) * markPrice;
  const maintenanceMargin = maintenanceMarginForNotional(positionValue);
  const positionEquity = entryMargin + unrealizedPnL;

  return {
    positionValue,
    unrealizedPnL,
    maintenanceMargin,
    positionEquity,
    roiPercent: roiPercent(unrealizedPnL, entryMargin),
  };
}

/** Margin ratio at entry (uPnL = 0): maintenanceRate × leverage × 100 (%). */
export function marginRatioAtEntry(leverage: number): number {
  if (!(leverage > 1)) return 0;
  return Number((MAINTENANCE_MARGIN_RATE * leverage * 100).toFixed(4));
}

/** @deprecated Use computePositionMarginRatio or computeAccountMarginRatio explicitly. */
export function marginRatioPercent(
  maintenanceMargin: number,
  equity: number,
): number {
  if (equity <= 0) return 999;
  return computePositionMarginRatio({
    maintenanceMargin,
    entryMargin: equity,
    unrealizedPnL: 0,
  });
}

export function isLiquidationCondition(args: {
  position: Pick<
    Position,
    "quantity" | "entryMargin" | "maintenanceMargin" | "unrealizedPnL" | "marginMode"
  >;
  accountEquity: number;
}): boolean {
  return isLiquidationTriggered({
    quantity: args.position.quantity,
    entryMargin: args.position.entryMargin,
    maintenanceMargin: args.position.maintenanceMargin,
    unrealizedPnL: args.position.unrealizedPnL,
    marginMode: args.position.marginMode,
    accountEquity: args.accountEquity,
  });
}
