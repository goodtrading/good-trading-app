import { FinancialEventLedger } from "@/lib/portfolio/financial/FinancialEventLedger";
import type { FinancialHistoryRow } from "@/lib/portfolio/financial/types";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import type { Trade } from "@/lib/portfolio/types";

/** Independent financial history — newest first. */
export function buildFinancialHistoryFromLedger(
  events: FinancialEvent[],
  trades: Trade[] = [],
): FinancialHistoryRow[] {
  const ledger = FinancialEventLedger.hydrate(events, trades);

  return [...ledger.listEvents()]
    .sort((a, b) => b.timestamp - a.timestamp || b.id.localeCompare(a.id))
    .map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      amount: event.amount,
      currency: event.currency,
      symbol: event.symbol,
      tradeId: event.tradeId,
      description: event.description,
    }));
}
