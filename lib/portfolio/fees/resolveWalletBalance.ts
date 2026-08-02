import { FinancialEventLedger } from "@/lib/portfolio/financial/FinancialEventLedger";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import { accumulatePositionFromTrades } from "@/lib/portfolio/positionEngine";
import type { Trade } from "@/lib/portfolio/types";

/** walletCash + realizedPnL + Σ(FinancialEvents) — events are signed (fees negative). */
export function resolveWalletBalance(
  walletCash: number,
  trades: Trade[],
  financialEvents?: FinancialEvent[],
): number {
  const { realizedPnL } = accumulatePositionFromTrades(trades);
  const ledger = FinancialEventLedger.hydrate(financialEvents, trades);
  const { netEffect } = ledger.aggregate();
  return walletCash + realizedPnL + netEffect;
}

/** @deprecated Alias — hydrates TRADE_FEE events from trades when none persisted. */
export function resolveWalletBalanceFromTrades(
  walletCash: number,
  trades: Trade[],
): number {
  return resolveWalletBalance(walletCash, trades);
}
