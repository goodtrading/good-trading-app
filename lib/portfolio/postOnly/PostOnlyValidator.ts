import type { ExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidity";
import type { TradeSide } from "@/lib/portfolio/types";
import type { TradeOrderType } from "@/lib/portfolio/trade/TradeExecutionRequest";

export class PostOnlyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostOnlyValidationError";
  }
}

export type PostOnlyValidationResult = {
  allowed: boolean;
  /** Post-only accepted orders always enter the book as maker liquidity. */
  executionLiquidity: ExecutionLiquidity;
  reason?: string;
};

/**
 * True when a LIMIT order would cross the spread and take liquidity immediately.
 *
 * BUY  limit >= mark → taker
 * SELL limit <= mark → taker
 */
export function wouldTakeLiquidity(
  side: TradeSide,
  limitPrice: number,
  markPrice: number,
): boolean {
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) return true;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return false;

  if (side === "BUY") return limitPrice >= markPrice;
  return limitPrice <= markPrice;
}

export function canRegisterPostOnly(
  side: TradeSide,
  limitPrice: number,
  markPrice: number,
): boolean {
  return !wouldTakeLiquidity(side, limitPrice, markPrice);
}

export function validatePostOnly(input: {
  side: TradeSide;
  limitPrice: number;
  markPrice: number;
  orderType: TradeOrderType;
}): PostOnlyValidationResult {
  if (input.orderType !== "LIMIT") {
    return {
      allowed: false,
      executionLiquidity: "UNKNOWN",
      reason: "Post Only requires a LIMIT order",
    };
  }

  if (wouldTakeLiquidity(input.side, input.limitPrice, input.markPrice)) {
    const detail =
      input.side === "BUY"
        ? "BUY limit price must be below mark price"
        : "SELL limit price must be above mark price";
    return {
      allowed: false,
      executionLiquidity: "UNKNOWN",
      reason: `Post Only order would take liquidity: ${detail}`,
    };
  }

  return {
    allowed: true,
    executionLiquidity: "MAKER",
  };
}

export function assertPostOnly(input: {
  side: TradeSide;
  limitPrice: number;
  markPrice: number;
  orderType: TradeOrderType;
}): ExecutionLiquidity {
  const result = validatePostOnly(input);
  if (!result.allowed) {
    throw new PostOnlyValidationError(result.reason ?? "Post Only order rejected");
  }
  return result.executionLiquidity;
}

/** PERP supports post-only LIMIT registration when mark price is available. */
export function resolvePostOnlySupported(): boolean {
  return true;
}

export function resolveMakerEligible(markPrice: number): boolean {
  return Number.isFinite(markPrice) && markPrice > 0;
}
