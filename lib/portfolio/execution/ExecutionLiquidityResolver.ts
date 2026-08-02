import type { ExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidity";
import { wouldTakeLiquidity } from "@/lib/portfolio/postOnly/PostOnlyValidator";
import type { TradeSide } from "@/lib/portfolio/types";
import type { TradeOrderType } from "@/lib/portfolio/trade/TradeExecutionRequest";

/** MARKET fills always take liquidity. */
export function resolveMarketExecutionLiquidity(): ExecutionLiquidity {
  return "TAKER";
}

/** LIMIT classification at registration — post-only is always maker. */
export function resolveLimitExecutionLiquidity(input: {
  side: TradeSide;
  limitPrice: number;
  markPrice: number;
  postOnly: boolean;
}): ExecutionLiquidity {
  if (input.postOnly) return "MAKER";
  return wouldTakeLiquidity(input.side, input.limitPrice, input.markPrice) ? "TAKER" : "MAKER";
}

/** Trade-entry preview — mirrors execution rules without UI involvement. */
export function resolvePreviewExecutionLiquidity(input: {
  side: TradeSide;
  limitPrice: number;
  markPrice: number;
  orderType: TradeOrderType;
  postOnlyEnabled: boolean;
}): ExecutionLiquidity {
  if (input.orderType === "MARKET") return "TAKER";
  if (input.postOnlyEnabled) return "MAKER";
  return resolveLimitExecutionLiquidity({
    side: input.side,
    limitPrice: input.limitPrice,
    markPrice: input.markPrice,
    postOnly: false,
  });
}
