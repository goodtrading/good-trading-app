import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  computeExecutionFees,
  createZeroTradeFees,
} from "@/lib/portfolio/fees/FeeModel";
import { resolvePreviewExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidityResolver";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
import { computeFundingPayment, computeFundingRate } from "@/lib/portfolio/funding/FundingEngine";
import { perpMetricsAtMark } from "@/lib/portfolio/futures/futuresAccounting";
import {
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
} from "@/lib/portfolio/futures/MarginModel";
import {
  DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  type PerpAccountPositionMode,
} from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import {
  buildHedgePositions,
  findHedgeLegPosition,
  aggregateHedgeLegMetrics,
} from "@/lib/portfolio/hedge/hedgePositionEngine";
import {
  inferPositionSideFromExecution,
  signedQuantityForLeg,
} from "@/lib/portfolio/hedge/resolvePositionSide";
import { buildPosition } from "@/lib/portfolio/positionEngine";
import { normalizeQuantity } from "@/lib/portfolio/sizing/PositionSizing";
import type { TradeDirection, MarginMode } from "@/lib/portfolio/trade/TradeExecutionRequest";
import { quantityFromMargin } from "@/lib/portfolio/trade/tradeEntryCalculations";
import type { Trade } from "@/lib/portfolio/types";

export type PerpPositionPreview = {
  quantity: number;
  entryPrice: number;
  positionValue: number;
  entryMargin: number;
  maintenanceMargin: number;
  positionMarginRatio: number;
  liquidationPrice: number | null;
  roi: number;
  unrealizedPnL: number;
  walletBalance: number;
  equity: number;
  availableBalance: number;
  marginUsed: number;
  lockedFunds: number;
  accountMarginRatio: number;
  /** Margin input used to size the order. */
  margin: number;
  estimatedOpeningFee: number;
  estimatedClosingFee: number;
  totalEstimatedFee: number;
  /** Estimated next funding payment if position stays open (domain only). */
  estimatedNextFunding: number;
};

export type PerpPositionPreviewInput = {
  direction: TradeDirection;
  margin: number | null;
  entryPrice: number | null;
  markPrice: number;
  leverage: number;
  marginMode: MarginMode;
  accountSnapshot: PortfolioAccountSnapshot | null;
  existingTrades?: Trade[];
  orderType?: "MARKET" | "LIMIT";
  postOnlyEnabled?: boolean;
  accountPositionMode?: PerpAccountPositionMode;
};

function buildHypotheticalTrade(args: {
  direction: TradeDirection;
  quantity: number;
  price: number;
  leverage: number;
  marginMode: MarginMode;
  timestamp: number;
  positionSide?: "LONG" | "SHORT";
}): Trade {
  return {
    id: "preview-hypothetical",
    symbol: PORTFOLIO_V1_SYMBOL,
    side: args.direction === "LONG" ? "BUY" : "SELL",
    quantity: args.quantity,
    price: args.price,
    timestamp: args.timestamp,
    source: "PAPER",
    leverage: args.leverage,
    marginMode: args.marginMode,
    ...(args.positionSide ? { positionSide: args.positionSide } : {}),
    fees: createZeroTradeFees(),
  };
}

/**
 * Simulates a PERP trade via buildPosition + MarginModel — no duplicated formulas.
 */
export function buildPerpPositionPreview(
  input: PerpPositionPreviewInput,
): PerpPositionPreview | null {
  const {
    direction,
    margin,
    entryPrice,
    markPrice,
    leverage,
    marginMode,
    accountSnapshot,
    existingTrades = [],
  } = input;

  const perp = accountSnapshot?.perp;
  if (
    margin == null ||
    entryPrice == null ||
    margin <= 0 ||
    entryPrice <= 0 ||
    !(markPrice > 0) ||
    !(leverage > 0)
  ) {
    return null;
  }

  const rawQty = quantityFromMargin({ margin, leverage, price: entryPrice });
  if (rawQty == null || rawQty <= 0) {
    return null;
  }

  const quantity = normalizeQuantity(PORTFOLIO_V1_SYMBOL, rawQty);
  if (quantity <= 0) {
    return null;
  }

  const lastTimestamp =
    existingTrades.length > 0
      ? Math.max(...existingTrades.map((t) => t.timestamp))
      : 0;

  const walletCash = perp?.walletCash ?? perp?.walletBalance ?? 0;
  const walletBalanceBefore = resolveWalletBalance(walletCash, existingTrades);
  const accountPositionMode =
    input.accountPositionMode ??
    (existingTrades.some((t) => t.positionSide != null)
      ? "HEDGE"
      : DEFAULT_PERP_ACCOUNT_POSITION_MODE);
  const tradeSide = direction === "LONG" ? "BUY" : "SELL";
  const positionSide =
    accountPositionMode === "HEDGE"
      ? inferPositionSideFromExecution({ side: tradeSide })
      : undefined;

  let quantityBefore = 0;
  let quantityAfter = 0;
  let previewLeg: ReturnType<typeof buildPosition> = null;
  let allLegsAfter: ReturnType<typeof buildHedgePositions> = [];

  if (accountPositionMode === "HEDGE") {
    const legsBefore = buildHedgePositions(existingTrades, markPrice, {
      leverage,
      marginMode,
      walletBalance: walletBalanceBefore,
    });
    quantityBefore = findHedgeLegPosition(legsBefore, PORTFOLIO_V1_SYMBOL, positionSide!)?.quantity ?? 0;
  } else {
    const beforePosition = buildPosition(existingTrades, markPrice, PORTFOLIO_V1_SYMBOL, {
      leverage,
      marginMode,
      walletBalance: walletBalanceBefore,
    });
    quantityBefore = beforePosition?.quantity ?? 0;
  }

  const hypothetical = buildHypotheticalTrade({
    direction,
    quantity,
    price: entryPrice,
    leverage,
    marginMode,
    timestamp: lastTimestamp + 1,
    positionSide,
  });

  const simulatedTrades = [...existingTrades, hypothetical];

  if (accountPositionMode === "HEDGE") {
    allLegsAfter = buildHedgePositions(simulatedTrades, markPrice, {
      leverage,
      marginMode,
      walletBalance: walletBalanceBefore,
    });
    previewLeg = findHedgeLegPosition(allLegsAfter, PORTFOLIO_V1_SYMBOL, positionSide!) ?? null;
    quantityAfter = previewLeg?.quantity ?? 0;
  } else {
    previewLeg = buildPosition(simulatedTrades, markPrice, PORTFOLIO_V1_SYMBOL, {
      leverage,
      marginMode,
      walletBalance: walletBalanceBefore,
    });
    quantityAfter = previewLeg?.quantity ?? 0;
  }

  const position = previewLeg;
  if (!position || position.quantity === 0) {
    return null;
  }

  const signedQty =
    accountPositionMode === "HEDGE" && positionSide
      ? signedQuantityForLeg(positionSide, position.quantity)
      : position.quantity;

  const metrics = perpMetricsAtMark({
    quantity: signedQty,
    avgEntry: position.avgEntry,
    leverage: position.leverage,
    entryMargin: position.entryMargin,
    markPrice,
  });

  const executionLiquidity = resolvePreviewExecutionLiquidity({
    side: hypothetical.side,
    limitPrice: entryPrice,
    markPrice,
    orderType: input.orderType ?? "MARKET",
    postOnlyEnabled: input.postOnlyEnabled ?? false,
  });

  const executionFees = computeExecutionFees({
    side: hypothetical.side,
    quantity: hypothetical.quantity,
    price: entryPrice,
    quantityBefore,
    quantityAfter,
    executionLiquidity,
  });

  const walletBalanceAfter =
    walletBalanceBefore - executionFees.breakdown.totalFee;

  const marginUsedAfter =
    accountPositionMode === "HEDGE"
      ? aggregateHedgeLegMetrics(allLegsAfter).marginUsed
      : position.entryMargin;
  const maintenanceAfter =
    accountPositionMode === "HEDGE"
      ? aggregateHedgeLegMetrics(allLegsAfter).maintenanceMarginTotal
      : metrics.maintenanceMargin;
  const unrealizedAfter =
    accountPositionMode === "HEDGE"
      ? aggregateHedgeLegMetrics(allLegsAfter).unrealizedPnL
      : metrics.unrealizedPnL;

  const liquidation = computeLiquidationState({
    quantity: signedQty,
    avgEntry: position.avgEntry,
    entryMargin: position.entryMargin,
    markPrice,
    leverage: position.leverage,
    marginMode: position.marginMode,
    walletBalance: walletBalanceAfter,
  });

  const wallet = computeWalletState({
    walletBalance: walletBalanceAfter,
    marginUsed: marginUsedAfter,
    unrealizedPnL: unrealizedAfter,
    maintenanceMarginTotal: maintenanceAfter,
    marginMode: position.marginMode,
  });

  return {
    quantity: Math.abs(position.quantity),
    entryPrice: position.avgEntry,
    positionValue: metrics.positionValue,
    entryMargin: position.entryMargin,
    maintenanceMargin: metrics.maintenanceMargin,
    positionMarginRatio: computePositionMarginRatio({
      maintenanceMargin: metrics.maintenanceMargin,
      entryMargin: position.entryMargin,
      unrealizedPnL: metrics.unrealizedPnL,
    }),
    liquidationPrice: liquidation.liquidationPrice,
    roi: metrics.roiPercent,
    unrealizedPnL: metrics.unrealizedPnL,
    walletBalance: wallet.walletBalance,
    equity: wallet.equity,
    availableBalance: wallet.availableBalance,
    marginUsed: wallet.marginUsed,
    lockedFunds: wallet.lockedFunds,
    accountMarginRatio: wallet.accountMarginRatio,
    margin,
    estimatedOpeningFee: executionFees.breakdown.openingFee,
    estimatedClosingFee: executionFees.breakdown.closingFee,
    totalEstimatedFee: executionFees.breakdown.totalFee,
    estimatedNextFunding: computeFundingPayment({
      quantity: signedQty,
      markPrice,
      fundingRate: computeFundingRate(),
    }),
  };
}

/** Map preview to legacy TradeEntrySummary for SPOT-adjacent callers. */
export function perpPreviewToTradeEntrySummary(
  preview: PerpPositionPreview | null,
): import("@/lib/portfolio/trade/tradeEntryCalculations").TradeEntrySummary {
  if (!preview) {
    return {
      positionValue: null,
      marginUsed: null,
      remainingBalance: null,
      estimatedLiquidation: null,
      estimatedOpeningFee: 0,
      estimatedClosingFee: 0,
      totalEstimatedFee: 0,
      estimatedNextFunding: 0,
      quantity: null,
      positionMarginRatio: null,
      accountMarginRatio: null,
      roi: null,
      maintenanceMargin: null,
      unrealizedPnL: null,
      walletBalanceAfterTrade: null,
      equityAfterTrade: null,
      availableBalanceAfterTrade: null,
      lockedFundsAfterTrade: null,
    };
  }

  return {
    positionValue: preview.positionValue,
    marginUsed: preview.entryMargin,
    remainingBalance: preview.availableBalance,
    estimatedLiquidation: preview.liquidationPrice,
    estimatedOpeningFee: preview.estimatedOpeningFee,
    estimatedClosingFee: preview.estimatedClosingFee,
    totalEstimatedFee: preview.totalEstimatedFee,
    estimatedNextFunding: preview.estimatedNextFunding,
    quantity: preview.quantity,
    positionMarginRatio: preview.positionMarginRatio,
    accountMarginRatio: preview.accountMarginRatio,
    roi: preview.roi,
    maintenanceMargin: preview.maintenanceMargin,
    unrealizedPnL: preview.unrealizedPnL,
    walletBalanceAfterTrade: preview.walletBalance,
    equityAfterTrade: preview.equity,
    availableBalanceAfterTrade: preview.availableBalance,
    lockedFundsAfterTrade: preview.lockedFunds,
  };
}
