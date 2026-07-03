import { describe, expect, it } from "vitest";

import { assertLedgerIntegrity, validateLedgerEntry } from "@/lib/cartera/ledger/LedgerEntrySchema";
import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { LedgerMutationForbiddenError } from "@/lib/cartera/ledger/LedgerTransaction";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { createTrade } from "@/lib/portfolio/tradeEngine";

describe("ledger-immutability", () => {
  it("load returns a clone — mutating loaded trades does not affect persisted ledger", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000));
    const tx = await beginLedgerTransaction(storage);
    tx.appendTrade(
      createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.01,
        price: 80_000,
        source: "PAPER",
      }),
    );
    await tx.commit();

    const loaded = await storage.load();
    loaded.trades.pop();
    loaded.trades.push({
      id: "forged",
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 999,
      price: 1,
      timestamp: Date.now(),
      source: "PAPER",
    });

    const afterMutation = await storage.load();
    expect(afterMutation.trades).toHaveLength(1);
    expect(afterMutation.trades[0]?.id).not.toBe("forged");
  });

  it("rejects invalid forged entries at validation boundary", () => {
    expect(() =>
      validateLedgerEntry({
        id: "bad",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: -1,
        price: 100,
        timestamp: Date.now(),
        source: "PAPER",
      }),
    ).toThrow();
  });

  it("rejects ledger array mutation patterns via integrity checks", () => {
    const trade = createTrade({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 1,
      price: 100,
      source: "PAPER",
    });

    expect(() => assertLedgerIntegrity([trade, trade], 1000)).toThrow();
  });

  it("rejects storage.clear as ledger mutation", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(1000));
    await expect(storage.clear()).rejects.toThrow(LedgerMutationForbiddenError);
  });
});
