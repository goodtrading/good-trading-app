import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { TradeDirection } from "@/lib/portfolio/trade/TradeExecutionRequest";

export type TradeEntrySummary = {
  positionValue: number | null;
  marginUsed: number | null;
  remainingBalance: number | null;
  estimatedLiquidation: number | null;
  /** @deprecated Use totalEstimatedFee */
  estimatedFee?: number | null;
  estimatedOpeningFee?: number;
  estimatedClosingFee?: number;
  totalEstimatedFee?: number;
  estimatedNextFunding?: number;
  /** Derived quantity (not user-editable). */
  quantity: number | null;
  /** PERP — position-level ratio from MarginModel. */
  positionMarginRatio?: number | null;
  /** PERP — account-level ratio from MarginModel. */
  accountMarginRatio?: number | null;
  /** @deprecated Use positionMarginRatio */
  marginRatio?: number | null;
  roi?: number | null;
  maintenanceMargin?: number | null;
  unrealizedPnL?: number | null;
  walletBalanceAfterTrade?: number | null;
  equityAfterTrade?: number | null;
  availableBalanceAfterTrade?: number | null;
  lockedFundsAfterTrade?: number | null;
};

export function formatMarginInput(margin: number): string {
  if (!Number.isFinite(margin) || margin < 0) return "";
  if (margin === 0) return "0";
  const fixed = margin >= 1 ? margin.toFixed(2) : margin.toFixed(4);
  return fixed.replace(/\.?0+$/, "");
}

export function formatQuantityDisplay(qty: number | null): string {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return "—";
  if (qty >= 1) return qty.toFixed(4).replace(/\.?0+$/, "");
  return qty.toFixed(6).replace(/\.?0+$/, "");
}

/** positionValue = margin × leverage */
export function positionValueFromMargin(margin: number, leverage: number): number | null {
  if (!Number.isFinite(margin) || margin <= 0 || !Number.isFinite(leverage) || leverage <= 0) {
    return null;
  }
  return margin * leverage;
}

/** quantity = positionValue / price */
export function quantityFromMargin(args: {
  margin: number;
  leverage: number;
  price: number;
}): number | null {
  const positionValue = positionValueFromMargin(args.margin, args.leverage);
  if (positionValue == null || args.price <= 0) return null;
  const qty = positionValue / args.price;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return qty;
}

/** margin = availableBalance × (percent / 100) */
export function marginFromPercent(percent: number, availableBalance: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  if (!Number.isFinite(availableBalance) || availableBalance < 0) return null;
  return availableBalance * (percent / 100);
}

/** percent = (margin / availableBalance) × 100 */
export function percentFromMargin(margin: number, availableBalance: number): number {
  if (!Number.isFinite(margin) || margin < 0) return 0;
  if (!Number.isFinite(availableBalance) || availableBalance <= 0) return 0;
  const percent = (margin / availableBalance) * 100;
  return Math.min(100, Math.max(0, percent));
}

/** SPOT-only entry summary — PERP uses buildPerpPositionPreview. */
export function computeSpotEntrySummary(args: {
  margin: number | null;
  entryPrice: number | null;
  cashBalance: number | null;
  derivedQuantity: number | null;
}): TradeEntrySummary {
  const { margin, entryPrice, cashBalance, derivedQuantity } = args;

  if (margin == null || entryPrice == null || margin <= 0 || entryPrice <= 0) {
    return {
      positionValue: null,
      marginUsed: margin != null && margin > 0 ? margin : null,
      remainingBalance: cashBalance,
      estimatedLiquidation: null,
      estimatedOpeningFee: 0,
      estimatedClosingFee: 0,
      totalEstimatedFee: 0,
      quantity: derivedQuantity,
    };
  }

  const positionValue =
    derivedQuantity != null && derivedQuantity > 0
      ? derivedQuantity * entryPrice
      : margin;

  const remainingBalance =
    cashBalance != null && Number.isFinite(cashBalance) ? cashBalance - margin : null;

  return {
    positionValue,
    marginUsed: margin,
    remainingBalance,
    estimatedLiquidation: null,
    estimatedOpeningFee: 0,
    estimatedClosingFee: 0,
    totalEstimatedFee: 0,
    quantity: derivedQuantity,
  };
}

/**
 * @deprecated PERP — use buildPerpPositionPreview. SPOT — use computeSpotEntrySummary.
 */
export function computeTradeEntrySummary(args: {
  margin: number | null;
  entryPrice: number | null;
  marketPrice: number;
  leverage: number;
  direction: TradeDirection;
  cashBalance: number | null;
  derivedQuantity?: number | null;
}): TradeEntrySummary {
  return computeSpotEntrySummary({
    margin: args.margin,
    entryPrice: args.entryPrice,
    cashBalance: args.cashBalance,
    derivedQuantity: args.derivedQuantity ?? null,
  });
}
