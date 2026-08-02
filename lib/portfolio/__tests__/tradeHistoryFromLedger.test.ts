import { describe, expect, it } from "vitest";

import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import type { Trade } from "@/lib/portfolio/types";

function trade(partial: Partial<Trade> & Pick<Trade, "id" | "side" | "quantity" | "price" | "timestamp">): Trade {
  return {
    symbol: "BTCUSDT",
    source: "PAPER",
    ...partial,
  };
}

describe("buildTradeHistoryFromLedger", () => {
  it("labels open and close with realized PnL from ledger only", () => {
    const rows = buildTradeHistoryFromLedger([
      trade({ id: "t1", side: "BUY", quantity: 1, price: 50_000, timestamp: 1 }),
      trade({ id: "t2", side: "SELL", quantity: 1, price: 55_000, timestamp: 2 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.action).toBe("CLOSE");
    expect(rows[0]?.direction).toBe("LONG");
    expect(rows[0]?.realizedPnL).toBe(5_000);
    expect(rows[1]?.action).toBe("OPEN");
    expect(rows[1]?.realizedPnL).toBeNull();
  });

  it("labels liquidation fills", () => {
    const rows = buildTradeHistoryFromLedger([
      trade({ id: "t1", side: "BUY", quantity: 1, price: 50_000, timestamp: 1 }),
      trade({
        id: "t2",
        side: "SELL",
        quantity: 1,
        price: 40_000,
        timestamp: 2,
        liquidation: true,
      }),
    ]);

    expect(rows[0]?.action).toBe("LIQUIDATION");
    expect(rows[0]?.realizedPnL).toBe(-10_000);
  });

  it("labels short open and cover", () => {
    const rows = buildTradeHistoryFromLedger([
      trade({ id: "t1", side: "SELL", quantity: 1, price: 60_000, timestamp: 1 }),
      trade({ id: "t2", side: "BUY", quantity: 1, price: 50_000, timestamp: 2 }),
    ]);

    expect(rows[1]?.action).toBe("OPEN");
    expect(rows[1]?.direction).toBe("SHORT");
    expect(rows[0]?.action).toBe("CLOSE");
    expect(rows[0]?.direction).toBe("SHORT");
    expect(rows[0]?.realizedPnL).toBe(10_000);
  });
});
