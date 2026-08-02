import { describe, expect, it, beforeEach } from "vitest";

import {
  beginLedgerTransaction,
  LedgerTransactionError,
} from "@/lib/cartera/ledger/LedgerTransaction";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createMatchingEngine } from "@/lib/portfolio/matching/MatchingEngine";
import { createOrderEngine, type OrderEngine } from "@/lib/portfolio/orders/OrderEngine";
import { createPortfolioEngine, type PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { createTrade } from "@/lib/portfolio/tradeEngine";

type EngineInternals = {
  orderEngine: OrderEngine;
  matchingEngine: ReturnType<typeof createMatchingEngine>;
};

function internals(engine: PortfolioEngine): EngineInternals {
  return engine as unknown as EngineInternals;
}

describe("trading hardening", () => {
  let storage: MemoryPortfolioStorage;
  let engine: PortfolioEngine;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    engine = createPortfolioEngine(storage, new PaperBroker());
  });

  it("does not double-fill the same limit order", async () => {
    await internals(engine).orderEngine.createLimitOrder({
      side: "BUY",
      quantity: 1,
      price: 55_000,
    });

    const first = await engine.onPriceUpdate(55_000);
    const second = await engine.onPriceUpdate(55_000);
    const third = await engine.onPriceUpdate(50_000);

    expect(first.trades).toHaveLength(1);
    expect(second.trades).toHaveLength(1);
    expect(third.trades).toHaveLength(1);
    expect(internals(engine).matchingEngine.getOpenOrders()).toHaveLength(0);
  });

  it("blocks duplicate trade ids in the ledger", async () => {
    const tx = await beginLedgerTransaction(storage);
    const trade = createTrade({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 0.01,
      price: 80_000,
      source: "PAPER",
    });

    tx.appendTrade(trade);
    expect(() => tx.appendTrade(trade)).toThrow(LedgerTransactionError);
    expect(() => tx.appendTrade(trade)).toThrow(/Duplicate trade id blocked/);

    const committed = await tx.commit();
    expect(committed.trades).toHaveLength(1);

    const tx2 = await beginLedgerTransaction(storage);
    expect(() => tx2.appendTrade(trade)).toThrow(/Duplicate trade id blocked/);
    tx2.rollback();
  });

  it("MARKET bypasses MatchingEngine", async () => {
    await engine.buy(1, 60_000, 60_000);

    expect(internals(engine).matchingEngine.getOpenOrders()).toHaveLength(0);

    const afterPrice = await engine.onPriceUpdate(60_000);
    expect(afterPrice.trades).toHaveLength(1);
    expect(internals(engine).matchingEngine.getOpenOrders()).toHaveLength(0);
  });

  it("LIMIT only executes once across repeated price updates", async () => {
    await internals(engine).orderEngine.createLimitOrder({
      side: "BUY",
      quantity: 1,
      price: 50_000,
    });

    const updates = await Promise.all([
      engine.onPriceUpdate(50_000),
      engine.onPriceUpdate(49_000),
      engine.onPriceUpdate(48_000),
    ]);

    const tradeCounts = updates.map((state) => state.trades.length);
    expect(Math.max(...tradeCounts)).toBe(1);

    const finalState = await engine.getState(48_000);
    expect(finalState.trades).toHaveLength(1);
    expect(finalState.trades[0]?.price).toBe(50_000);
  });

  it("multiple concurrent price updates are safe (idempotent)", async () => {
    await internals(engine).orderEngine.createLimitOrder({
      side: "BUY",
      quantity: 1,
      price: 55_000,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => engine.onPriceUpdate(55_000)),
    );

    for (const state of results) {
      expect(state.trades.length).toBeLessThanOrEqual(1);
    }

    const persisted = await storage.load();
    expect(persisted.trades).toHaveLength(1);

    const ids = new Set(persisted.trades.map((trade) => trade.id));
    expect(ids.size).toBe(1);
  });

  it("rejects MARKET orders on MatchingEngine.addOrder", () => {
    const matching = createMatchingEngine(new PaperBroker());
    expect(() =>
      matching.addOrder({
        id: "order_market_1",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "MARKET",
        quantity: 1,
        price: 60_000,
        status: "OPEN",
        createdAt: Date.now(),
      }),
    ).toThrow(/only accepts LIMIT orders/);
  });

  it("rejects invalid order state transitions", () => {
    const matching = createMatchingEngine(new PaperBroker());
    const order = {
      id: "order_state_1",
      symbol: "BTCUSDT" as const,
      side: "BUY" as const,
      type: "LIMIT" as const,
      quantity: 1,
      price: 55_000,
      status: "FILLED" as const,
      createdAt: Date.now(),
    };

    expect(() => matching.updateOrderState(order, "OPEN")).toThrow(
      /Invalid order state transition/,
    );

    const cancelled = { ...order, status: "CANCELLED" as const };
    expect(() => matching.updateOrderState(cancelled, "FILLED")).toThrow(
      /Invalid order state transition/,
    );
  });

  it("onPriceUpdate does not throw when matching fails", async () => {
    const broker = new PaperBroker();
    const failingEngine = createPortfolioEngine(storage, broker);
    const matching = internals(failingEngine).matchingEngine;

    const originalMatch = matching.match.bind(matching);
    matching.match = async () => {
      throw new Error("simulated match failure");
    };

    await expect(failingEngine.onPriceUpdate(60_000)).resolves.toBeDefined();

    matching.match = originalMatch;
  });
});
