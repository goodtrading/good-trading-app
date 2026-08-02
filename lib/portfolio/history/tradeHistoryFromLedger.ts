import { sortTradesChronologically } from "@/lib/portfolio/tradeEngine";
import { hydrateTradeFees } from "@/lib/portfolio/fees/hydrateTradeFees";
import type { TradeFeeRecord } from "@/lib/portfolio/fees/types";
import type { Trade } from "@/lib/portfolio/types";

export type TradeHistoryAction = "OPEN" | "CLOSE" | "LIQUIDATION";

export type TradeHistoryRow = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  action: TradeHistoryAction;
  price: number;
  quantity: number;
  /** Realized PnL for CLOSE / LIQUIDATION legs; null on OPEN. */
  realizedPnL: number | null;
  timestamp: number;
  fees: TradeFeeRecord;
  reduceOnly?: boolean;
  postOnly?: boolean;
  executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
  triggerReason?: import("@/lib/portfolio/oco/OcoGroup").TradeTriggerReason;
};

/**
 * Builds display rows from ledger trades only (no UI-side state).
 * Walks fills chronologically to label OPEN / CLOSE / LIQUIDATION and realized PnL.
 */
export function buildTradeHistoryFromLedger(trades: Trade[]): TradeHistoryRow[] {
  const sorted = sortTradesChronologically(trades);
  let quantity = 0;
  let costBasis = 0;
  const rows: TradeHistoryRow[] = [];

  for (const raw of sorted) {
    const trade = hydrateTradeFees(raw);
    let realizedPnL: number | null = null;
    let action: TradeHistoryAction;
    let direction: "LONG" | "SHORT";

    if (trade.side === "BUY") {
      if (quantity < 0) {
        // Cover short (close / liquidation).
        const shortQty = -quantity;
        const avgEntry = costBasis / shortQty;
        const closed = Math.min(trade.quantity, shortQty);
        realizedPnL = closed * (avgEntry - trade.price);
        action = trade.liquidation ? "LIQUIDATION" : "CLOSE";
        direction = "SHORT";

        if (trade.quantity < shortQty) {
          costBasis -= trade.quantity * avgEntry;
          quantity += trade.quantity;
        } else {
          const excess = trade.quantity - shortQty;
          quantity = excess;
          costBasis = excess > 0 ? excess * trade.price : 0;
        }
      } else {
        quantity += trade.quantity;
        costBasis += trade.quantity * trade.price;
        action = "OPEN";
        direction = "LONG";
      }
    } else if (quantity > 0) {
      // Reduce long (close / liquidation).
      const avgEntry = costBasis / quantity;
      const closed = Math.min(trade.quantity, quantity);
      realizedPnL = closed * (trade.price - avgEntry);
      action = trade.liquidation ? "LIQUIDATION" : "CLOSE";
      direction = "LONG";

      if (trade.quantity < quantity) {
        costBasis -= trade.quantity * avgEntry;
        quantity -= trade.quantity;
      } else if (trade.quantity === quantity) {
        quantity = 0;
        costBasis = 0;
      } else {
        const excess = trade.quantity - quantity;
        quantity = -excess;
        costBasis = excess * trade.price;
      }
    } else {
      // Open / increase short.
      quantity -= trade.quantity;
      costBasis += trade.quantity * trade.price;
      action = "OPEN";
      direction = "SHORT";
    }

    rows.push({
      id: trade.id,
      symbol: trade.symbol,
      direction,
      action,
      price: trade.price,
      quantity: trade.quantity,
      realizedPnL,
      timestamp: trade.timestamp,
      fees: trade.fees,
      ...(trade.reduceOnly ? { reduceOnly: true } : {}),
      ...(trade.postOnly ? { postOnly: true } : {}),
      ...(trade.executionLiquidity ? { executionLiquidity: trade.executionLiquidity } : {}),
      ...(trade.triggerReason ? { triggerReason: trade.triggerReason } : {}),
    });
  }

  return rows.sort((a, b) => b.timestamp - a.timestamp);
}
