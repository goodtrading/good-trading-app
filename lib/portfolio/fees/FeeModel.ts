import type {
  ExecutionFee,
  FeeBreakdown,
  FeeSchedule,
  PerpFeeMetrics,
  TradeFee,
  TradeFeeRecord,
} from "@/lib/portfolio/fees/types";
import { DEFAULT_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";
import type { ExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidity";
import { resolvePreviewExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidityResolver";
import type { TradeSide } from "@/lib/portfolio/types";

export const FEE_MODEL_VERSION = DEFAULT_FEE_SCHEDULE.version;

/** @deprecated Legacy zero schedule — use DEFAULT_FEE_SCHEDULE. */
export const ZERO_FEE_POLICY = {
  version: "zero-v1",
  makerRate: 0,
  takerRate: 0,
  openingRate: 0,
  closingRate: 0,
  fundingRate: 0,
  currency: "USDT",
};

export type FeeComputationContext = {
  side: TradeSide;
  quantity: number;
  price: number;
  quantityBefore: number;
  quantityAfter: number;
  /** Sole source for maker vs taker rate selection (FASE 12.5). */
  executionLiquidity: ExecutionLiquidity;
  schedule?: FeeSchedule;
};

export type PreviewFeeContext = {
  direction: "LONG" | "SHORT";
  quantity: number;
  price: number;
  markPrice: number;
  quantityBefore?: number;
  orderType?: "MARKET" | "LIMIT";
  postOnlyEnabled?: boolean;
  schedule?: FeeSchedule;
};

function roundFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number(amount.toFixed(4));
}

/** UNKNOWN legacy executions default to taker for historical compatibility. */
export function feeRateForLiquidity(
  executionLiquidity: ExecutionLiquidity,
  schedule: FeeSchedule = DEFAULT_FEE_SCHEDULE,
): number {
  return executionLiquidity === "MAKER" ? schedule.makerRate : schedule.takerRate;
}

/** Splits execution notional into opening vs closing legs (handles partial + flip). */
export function resolveExecutionNotional(context: Pick<
  FeeComputationContext,
  "side" | "quantity" | "price" | "quantityBefore" | "quantityAfter"
>): {
  openingNotional: number;
  closingNotional: number;
} {
  const { quantity, price, quantityBefore, quantityAfter } = context;
  if (!(quantity > 0) || !(price > 0)) {
    return { openingNotional: 0, closingNotional: 0 };
  }

  const before = quantityBefore;
  const after = quantityAfter;

  if (before === 0) {
    return { openingNotional: quantity * price, closingNotional: 0 };
  }

  if (after === 0) {
    return { openingNotional: 0, closingNotional: quantity * price };
  }

  const beforeSign = Math.sign(before);
  const afterSign = Math.sign(after);

  if (beforeSign === afterSign) {
    const beforeAbs = Math.abs(before);
    const afterAbs = Math.abs(after);
    if (afterAbs > beforeAbs) {
      return { openingNotional: (afterAbs - beforeAbs) * price, closingNotional: 0 };
    }
    return { openingNotional: 0, closingNotional: (beforeAbs - afterAbs) * price };
  }

  return {
    closingNotional: Math.abs(before) * price,
    openingNotional: Math.abs(after) * price,
  };
}

export function computeOpeningFee(context: FeeComputationContext): number {
  const schedule = context.schedule ?? DEFAULT_FEE_SCHEDULE;
  const { openingNotional } = resolveExecutionNotional(context);
  return roundFee(openingNotional * feeRateForLiquidity(context.executionLiquidity, schedule));
}

export function computeClosingFee(context: FeeComputationContext): number {
  const schedule = context.schedule ?? DEFAULT_FEE_SCHEDULE;
  const { closingNotional } = resolveExecutionNotional(context);
  return roundFee(closingNotional * feeRateForLiquidity(context.executionLiquidity, schedule));
}

export function computeMakerFee(context: FeeComputationContext): number {
  if (context.executionLiquidity !== "MAKER") return 0;
  return roundFee(computeOpeningFee(context) + computeClosingFee(context));
}

export function computeTakerFee(context: FeeComputationContext): number {
  if (context.executionLiquidity === "MAKER") return 0;
  return roundFee(computeOpeningFee(context) + computeClosingFee(context));
}

/** Placeholder — funding not implemented until a later phase. */
export function computeFundingFee(_context: FeeComputationContext): number {
  return 0;
}

export function createZeroFeeBreakdown(): FeeBreakdown {
  return {
    makerFee: 0,
    takerFee: 0,
    openingFee: 0,
    closingFee: 0,
    fundingFee: 0,
    totalFee: 0,
    currency: DEFAULT_FEE_SCHEDULE.currency,
    feeModelVersion: "zero-v1",
  };
}

export function createZeroExecutionFee(): ExecutionFee {
  const breakdown = createZeroFeeBreakdown();
  return {
    breakdown,
    items: [
      { type: "MAKER", amount: 0, currency: breakdown.currency },
      { type: "TAKER", amount: 0, currency: breakdown.currency },
      { type: "OPENING", amount: 0, currency: breakdown.currency },
      { type: "CLOSING", amount: 0, currency: breakdown.currency },
      { type: "FUNDING", amount: 0, currency: breakdown.currency },
    ],
  };
}

export function createZeroTradeFees(): TradeFeeRecord {
  const breakdown = createZeroFeeBreakdown();
  return {
    openingFee: breakdown.openingFee,
    closingFee: breakdown.closingFee,
    fundingFee: breakdown.fundingFee,
    totalFee: breakdown.totalFee,
    feeCurrency: breakdown.currency,
    feeModelVersion: breakdown.feeModelVersion,
    breakdown,
  };
}

export function computeExecutionFees(context: FeeComputationContext): ExecutionFee {
  const schedule = context.schedule ?? DEFAULT_FEE_SCHEDULE;
  const openingFee = computeOpeningFee(context);
  const closingFee = computeClosingFee(context);
  const makerFee = computeMakerFee(context);
  const takerFee = computeTakerFee(context);
  const fundingFee = computeFundingFee(context);
  const totalFee = roundFee(openingFee + closingFee + fundingFee);

  const breakdown: FeeBreakdown = {
    makerFee,
    takerFee,
    openingFee,
    closingFee,
    fundingFee,
    totalFee,
    currency: schedule.currency,
    feeModelVersion: schedule.version,
  };

  const items: TradeFee[] = [
    { type: "MAKER", amount: makerFee, currency: schedule.currency },
    { type: "TAKER", amount: takerFee, currency: schedule.currency },
    { type: "OPENING", amount: openingFee, currency: schedule.currency },
    { type: "CLOSING", amount: closingFee, currency: schedule.currency },
    { type: "FUNDING", amount: fundingFee, currency: schedule.currency },
  ];

  return { breakdown, items };
}

export function executionFeeToTradeRecord(execution: ExecutionFee): TradeFeeRecord {
  const { breakdown } = execution;
  return {
    openingFee: breakdown.openingFee,
    closingFee: breakdown.closingFee,
    fundingFee: breakdown.fundingFee,
    totalFee: breakdown.totalFee,
    feeCurrency: breakdown.currency,
    feeModelVersion: breakdown.feeModelVersion,
    breakdown,
  };
}

/** Trade-entry preview — derives executionLiquidity from order shape. */
export function computePreviewFees(context: PreviewFeeContext): PerpFeeMetrics {
  const side: TradeSide = context.direction === "LONG" ? "BUY" : "SELL";
  const quantityBefore = context.quantityBefore ?? 0;
  const signedQty = context.direction === "LONG" ? context.quantity : -context.quantity;
  const quantityAfter =
    quantityBefore === 0
      ? signedQty
      : Math.sign(quantityBefore) === Math.sign(signedQty)
        ? quantityBefore + signedQty
        : signedQty;

  const executionLiquidity = resolvePreviewExecutionLiquidity({
    side,
    limitPrice: context.price,
    markPrice: context.markPrice,
    orderType: context.orderType ?? "MARKET",
    postOnlyEnabled: context.postOnlyEnabled ?? false,
  });

  const execution = computeExecutionFees({
    side,
    quantity: context.quantity,
    price: context.price,
    quantityBefore,
    quantityAfter,
    executionLiquidity,
    schedule: context.schedule,
  });

  return {
    feesPaid: 0,
    feesToday: 0,
    openingFees: execution.breakdown.openingFee,
    closingFees: execution.breakdown.closingFee,
    fundingFees: 0,
    totalFees: execution.breakdown.totalFee,
    estimatedOpeningFee: execution.breakdown.openingFee,
    estimatedClosingFee: execution.breakdown.closingFee,
    makerTrades: 0,
    takerTrades: 0,
    makerFees: 0,
    takerFees: 0,
  };
}
