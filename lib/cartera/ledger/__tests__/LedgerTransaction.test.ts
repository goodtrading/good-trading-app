import { describe, expect, it } from "vitest";

import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { MemoryPortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import { createTrade } from "@/lib/portfolio/tradeEngine";

describe("LedgerTransaction", () => {
  it("commits append atomically after validation", async () => {
    const storage = new MemoryPortfolioStorage();
    const tx = await beginLedgerTransaction(storage);

    const trade = createTrade({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.01,
      price: 80000,
      source: "PAPER",
    });

    tx.appendTrade(trade);
    const committed = await tx.commit();

    expect(committed.trades).toHaveLength(1);
    expect(committed.trades[0]?.id).toBe(trade.id);
  });

  it("rolls back pending entries without persisting", async () => {
    const storage = new MemoryPortfolioStorage();
    const tx = await beginLedgerTransaction(storage);

    tx.appendTrade(
      createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.01,
        price: 80000,
        source: "PAPER",
      }),
    );

    tx.rollback();
    const loaded = await storage.load();
    expect(loaded.trades).toHaveLength(0);
  });
});
