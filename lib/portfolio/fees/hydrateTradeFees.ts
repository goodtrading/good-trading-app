import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import type { TradeFeeRecord } from "@/lib/portfolio/fees/types";
import type { Trade } from "@/lib/portfolio/types";

function isTradeFeeRecord(value: unknown): value is TradeFeeRecord {
  if (value == null || typeof value !== "object") return false;
  const record = value as TradeFeeRecord;
  return (
    typeof record.openingFee === "number" &&
    typeof record.closingFee === "number" &&
    typeof record.fundingFee === "number" &&
    typeof record.totalFee === "number" &&
    typeof record.feeCurrency === "string" &&
    typeof record.feeModelVersion === "string" &&
    record.breakdown != null
  );
}

/** Ensures every trade carries a complete fee record (zeros for legacy ledgers). */
export function hydrateTradeFees(trade: Trade): Trade {
  if (isTradeFeeRecord(trade.fees)) {
    return trade;
  }
  return {
    ...trade,
    fees: createZeroTradeFees(),
  };
}

export function hydrateTradeLedger(trades: Trade[]): Trade[] {
  return trades.map(hydrateTradeFees);
}
