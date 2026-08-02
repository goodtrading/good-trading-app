import { FinancialEventLedger } from "@/lib/portfolio/financial/FinancialEventLedger";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import type { PerpFeeMetrics } from "@/lib/portfolio/fees/types";
import type { Trade } from "@/lib/portfolio/types";

/** Sum financial events — never mixed into realizedPnL. */
export function aggregateTradeFees(
  trades: Trade[],
  financialEvents?: FinancialEvent[],
  asOfTimestamp: number = Date.now(),
): PerpFeeMetrics {
  const ledger = FinancialEventLedger.hydrate(financialEvents, trades);
  const agg = ledger.aggregate(asOfTimestamp);

  return {
    feesPaid: agg.feesPaid,
    feesToday: agg.feesToday,
    openingFees: agg.openingFees,
    closingFees: agg.closingFees,
    fundingFees: Math.abs(agg.fundingPaid),
    totalFees: agg.feesPaid,
    estimatedOpeningFee: 0,
    estimatedClosingFee: 0,
    makerTrades: agg.makerTrades,
    takerTrades: agg.takerTrades,
    makerFees: agg.makerFees,
    takerFees: agg.takerFees,
  };
}
