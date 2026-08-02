import type { MarginMode } from "@/lib/portfolio/types";

/** Maintenance margin rate on mark notional (0.5%). */
export const MAINTENANCE_MARGIN_RATE = 0.005;

export function maintenanceMarginForNotional(notional: number): number {
  if (!Number.isFinite(notional) || notional <= 0) return 0;
  return notional * MAINTENANCE_MARGIN_RATE;
}

export type LiquidationState = {
  liquidationPrice: number | null;
  bankruptcyPrice: number | null;
  maintenanceMargin: number;
  equityAtRisk: number;
  /** Mark − liq (long) or liq − mark (short); positive = safe buffer in price. */
  distanceToLiquidation: number | null;
  /** Position margin ratio — 100% at liquidation trigger. */
  liquidationPercent: number;
};

export type WalletState = {
  walletBalance: number;
  equity: number;
  marginUsed: number;
  availableBalance: number;
  lockedFunds: number;
  accountMarginRatio: number;
  unrealizedPnL: number;
};

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function clampRatio(value: number): number {
  return Number(Math.min(999, value).toFixed(4));
}

/** Position margin ratio = maintenance / (entryMargin + uPnL) × 100. */
export function computePositionMarginRatio(args: {
  maintenanceMargin: number;
  entryMargin: number;
  unrealizedPnL: number;
}): number {
  const positionEquity = args.entryMargin + args.unrealizedPnL;
  if (positionEquity <= 0) return 999;
  return clampRatio((args.maintenanceMargin / positionEquity) * 100);
}

/** Account margin ratio = maintenanceTotal / accountEquity × 100. */
export function computeAccountMarginRatio(args: {
  maintenanceMarginTotal: number;
  accountEquity: number;
}): number {
  if (args.accountEquity <= 0) return 999;
  return clampRatio((args.maintenanceMarginTotal / args.accountEquity) * 100);
}

export function computeEquity(
  walletBalance: number,
  unrealizedPnL: number,
): number {
  return walletBalance + unrealizedPnL;
}

/** Cross: wallet − marginUsed + uPnL. Isolated: wallet − marginUsed. */
export function computeAvailableBalance(args: {
  walletBalance: number;
  marginUsed: number;
  unrealizedPnL: number;
  marginMode: MarginMode;
}): number {
  const { walletBalance, marginUsed, unrealizedPnL, marginMode } = args;
  if (marginMode === "ISOLATED") {
    return walletBalance - marginUsed;
  }
  return walletBalance - marginUsed + unrealizedPnL;
}

/** Cross → account equity. Isolated → entryMargin + uPnL. */
export function computeEquityAtRisk(args: {
  marginMode: MarginMode;
  entryMargin: number;
  unrealizedPnL: number;
  accountEquity: number;
}): number {
  if (args.marginMode === "ISOLATED") {
    return args.entryMargin + args.unrealizedPnL;
  }
  return args.accountEquity;
}

function solveLiquidationPriceLong(args: {
  quantity: number;
  avgEntry: number;
  entryMargin: number;
  walletBalance: number;
  marginMode: MarginMode;
}): number | null {
  const { quantity, avgEntry, entryMargin, walletBalance, marginMode } = args;
  const mmr = MAINTENANCE_MARGIN_RATE;
  const denom = quantity * (mmr - 1);
  if (denom === 0) return null;

  const buffer = marginMode === "CROSS" ? walletBalance : 0;
  const numerator = buffer + entryMargin - quantity * avgEntry;
  const price = numerator / denom;
  return price > 0 ? round4(price) : null;
}

function solveLiquidationPriceShort(args: {
  quantity: number;
  avgEntry: number;
  entryMargin: number;
  walletBalance: number;
  marginMode: MarginMode;
}): number | null {
  const Q = Math.abs(args.quantity);
  const { avgEntry, entryMargin, walletBalance, marginMode } = args;
  const mmr = MAINTENANCE_MARGIN_RATE;
  const denom = Q * (1 + mmr);
  if (denom === 0) return null;

  const buffer = marginMode === "CROSS" ? walletBalance : 0;
  const numerator = buffer + entryMargin + Q * avgEntry;
  const price = numerator / denom;
  return price > 0 ? round4(price) : null;
}

function solveBankruptcyPriceLong(args: {
  quantity: number;
  avgEntry: number;
  entryMargin: number;
  walletBalance: number;
  marginMode: MarginMode;
}): number | null {
  const { quantity, avgEntry, entryMargin, walletBalance, marginMode } = args;
  if (quantity === 0) return null;
  const buffer = marginMode === "CROSS" ? walletBalance : 0;
  const price = avgEntry - (buffer + entryMargin) / quantity;
  return price > 0 ? round4(price) : null;
}

function solveBankruptcyPriceShort(args: {
  quantity: number;
  avgEntry: number;
  entryMargin: number;
  walletBalance: number;
  marginMode: MarginMode;
}): number | null {
  const Q = Math.abs(args.quantity);
  if (Q === 0) return null;
  const { avgEntry, entryMargin, walletBalance, marginMode } = args;
  const buffer = marginMode === "CROSS" ? walletBalance : 0;
  const price = avgEntry + (buffer + entryMargin) / Q;
  return price > 0 ? round4(price) : null;
}

/**
 * Unified liquidation model — same equity breach logic as RiskScheduler.
 * Cross includes wallet buffer; Isolated uses position margin only.
 */
export function computeLiquidationState(args: {
  quantity: number;
  avgEntry: number;
  entryMargin: number;
  markPrice: number;
  leverage: number;
  marginMode: MarginMode;
  walletBalance: number;
}): LiquidationState {
  const {
    quantity,
    avgEntry,
    entryMargin,
    markPrice,
    leverage,
    marginMode,
    walletBalance,
  } = args;

  if (
    quantity === 0 ||
    leverage <= 1 ||
    !(avgEntry > 0) ||
    !(markPrice > 0)
  ) {
    return {
      liquidationPrice: null,
      bankruptcyPrice: null,
      maintenanceMargin: 0,
      equityAtRisk: 0,
      distanceToLiquidation: null,
      liquidationPercent: 0,
    };
  }

  const unrealizedPnL = quantity * (markPrice - avgEntry);
  const positionValue = Math.abs(quantity) * markPrice;
  const maintenanceMargin = maintenanceMarginForNotional(positionValue);
  const accountEquity = computeEquity(walletBalance, unrealizedPnL);
  const equityAtRisk = computeEquityAtRisk({
    marginMode,
    entryMargin,
    unrealizedPnL,
    accountEquity,
  });

  const liqArgs = {
    quantity,
    avgEntry,
    entryMargin,
    walletBalance,
    marginMode,
  };

  const liquidationPrice =
    quantity > 0
      ? solveLiquidationPriceLong(liqArgs)
      : solveLiquidationPriceShort(liqArgs);

  const bankruptcyPrice =
    quantity > 0
      ? solveBankruptcyPriceLong(liqArgs)
      : solveBankruptcyPriceShort(liqArgs);

  let distanceToLiquidation: number | null = null;
  if (liquidationPrice != null) {
    distanceToLiquidation =
      quantity > 0
        ? round4(markPrice - liquidationPrice)
        : round4(liquidationPrice - markPrice);
  }

  const liquidationPercent = computePositionMarginRatio({
    maintenanceMargin,
    entryMargin,
    unrealizedPnL,
  });

  return {
    liquidationPrice,
    bankruptcyPrice,
    maintenanceMargin,
    equityAtRisk: round4(equityAtRisk),
    distanceToLiquidation,
    liquidationPercent,
  };
}

export function isLiquidationTriggered(args: {
  quantity: number;
  entryMargin: number;
  maintenanceMargin: number;
  unrealizedPnL: number;
  marginMode: MarginMode;
  accountEquity: number;
}): boolean {
  if (args.quantity === 0) return false;
  const atRisk = computeEquityAtRisk({
    marginMode: args.marginMode,
    entryMargin: args.entryMargin,
    unrealizedPnL: args.unrealizedPnL,
    accountEquity: args.accountEquity,
  });
  return atRisk <= args.maintenanceMargin;
}

/** Account-level wallet read model after applying position metrics. */
export function computeWalletState(args: {
  walletBalance: number;
  marginUsed: number;
  unrealizedPnL: number;
  maintenanceMarginTotal: number;
  marginMode: MarginMode;
}): WalletState {
  const { walletBalance, marginUsed, unrealizedPnL, maintenanceMarginTotal, marginMode } =
    args;

  const equity = computeEquity(walletBalance, unrealizedPnL);
  const availableBalance = computeAvailableBalance({
    walletBalance,
    marginUsed,
    unrealizedPnL,
    marginMode,
  });

  return {
    walletBalance,
    equity,
    marginUsed,
    availableBalance,
    lockedFunds: marginUsed,
    accountMarginRatio: computeAccountMarginRatio({
      maintenanceMarginTotal,
      accountEquity: equity,
    }),
    unrealizedPnL,
  };
}
