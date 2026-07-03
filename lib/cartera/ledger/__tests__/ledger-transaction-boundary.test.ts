import { describe, expect, it, vi } from "vitest";

import { beginLedgerTransaction, commitGenesisLedger } from "@/lib/cartera/ledger/LedgerTransaction";
import { LedgerMutationForbiddenError } from "@/lib/cartera/ledger/LedgerTransaction";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { createTrade } from "@/lib/portfolio/tradeEngine";

describe("ledger-transaction-boundary", () => {
  it("buy/sell persist only through LedgerTransaction.commit", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(100_000));
    const saveSpy = vi.spyOn(storage, "save");
    const engine = createPortfolioEngine(storage, new PaperBroker());

    await engine.buy(0.01, 80_000, 80_000);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const persisted = await storage.load();
    expect(persisted.trades).toHaveLength(1);
  });

  it("rejects direct storage.save outside commit context", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(1000));

    await expect(storage.save(createEmptyPersistedState(1000))).rejects.toThrow(
      LedgerMutationForbiddenError,
    );
  });

  it("commitGenesisLedger is the only allowed first-write for new wallets", async () => {
    const storage = new MemoryPortfolioStorage();
    await commitGenesisLedger(storage, 25_000);

    const loaded = await storage.load();
    expect(loaded.initialCashBalance).toBe(25_000);
    expect(loaded.trades).toHaveLength(0);
  });

  it("rejects genesis when ledger already has entries", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(1000));
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

    await expect(commitGenesisLedger(storage, 1000)).rejects.toThrow(LedgerMutationForbiddenError);
  });

  it("PortfolioEngine has no reset write path", () => {
    const engine = createPortfolioEngine(new MemoryPortfolioStorage(), new PaperBroker());
    expect("reset" in engine).toBe(false);
  });

  it("storage.save only occurs inside transaction commit", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(50_000));
    const saveSpy = vi.spyOn(storage, "save");

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

    expect(saveSpy).not.toHaveBeenCalled();
    await tx.commit();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
