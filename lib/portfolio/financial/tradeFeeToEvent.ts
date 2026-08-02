import { hydrateTradeFees } from "@/lib/portfolio/fees/hydrateTradeFees";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import type { Trade } from "@/lib/portfolio/types";

export const TRADE_FEE_EVENT_PREFIX = "fee_";

/** Build a TRADE_FEE event from a trade's persisted fee record. Returns null when fee is zero. */
export function createTradeFeeEvent(trade: Trade): FinancialEvent | null {
  const hydrated = hydrateTradeFees(trade);
  if (!(hydrated.fees.totalFee > 0)) {
    return null;
  }

  return {
    id: `${TRADE_FEE_EVENT_PREFIX}${hydrated.id}`,
    timestamp: hydrated.timestamp,
    type: "TRADE_FEE",
    amount: -hydrated.fees.totalFee,
    currency: hydrated.fees.feeCurrency,
    symbol: hydrated.symbol,
    tradeId: hydrated.id,
    description: `Trade fee (${hydrated.side} ${hydrated.quantity} @ ${hydrated.price})`,
    version: hydrated.fees.feeModelVersion,
    openingFee: hydrated.fees.openingFee,
    closingFee: hydrated.fees.closingFee,
    fundingFee: hydrated.fees.fundingFee,
    executionLiquidity: hydrated.executionLiquidity ?? "UNKNOWN",
    makerFeeAmount: hydrated.fees.breakdown.makerFee,
    takerFeeAmount: hydrated.fees.breakdown.takerFee,
  };
}
