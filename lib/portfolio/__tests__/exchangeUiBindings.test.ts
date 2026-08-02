import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoryStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: async (key: string) => {
      memoryStore.delete(key);
    },
    clear: async () => {
      memoryStore.clear();
    },
  },
}));

import { commitGenesisLedger } from "@/lib/cartera/ledger/LedgerTransaction";
import { portfolioTradesStorageKey } from "@/lib/portfolio/accounts/accountStorage";
import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import { engineRuntimeMetaStorageKey } from "@/lib/portfolio/bootstrap/PortfolioEngineHydrator";
import { portfolioEngineRuntime } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";
import { priceStream } from "@/lib/portfolio/runtime/PriceStream";

async function seedAccount(accountId: string, initialCash = 500_000): Promise<void> {
  memoryStore.delete(portfolioTradesStorageKey(accountId));
  memoryStore.delete(engineRuntimeMetaStorageKey(accountId));
  const storage = createPortfolioStorageForAccount(accountId);
  await commitGenesisLedger(storage, initialCash);
}

describe("Exchange UI bindings", () => {
  beforeEach(async () => {
    memoryStore.clear();
    await portfolioEngineRuntime.resetForTests();
  });

  afterEach(async () => {
    await portfolioEngineRuntime.resetForTests();
  });

  it("OrderPanel path: buy/sell via active engine", async () => {
    await seedAccount("acc_ui_trade");
    const engine = await portfolioEngineRuntime.start("acc_ui_trade", {
      marketPrice: 60_000,
      positionMode: "LONG_SHORT",
    });

    await engine.buy(1, 60_000, 60_000);
    let state = await engine.getState(60_000);
    expect(state.positions[0]?.quantity).toBe(1);

    await engine.sell(1, 61_000, 61_000);
    state = await engine.getState(61_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
  });

  it("OrderBook reflects MatchingEngine open limit orders", async () => {
    await seedAccount("acc_ui_book");
    const engine = await portfolioEngineRuntime.start("acc_ui_book", {
      marketPrice: 60_000,
      positionMode: "LONG_SHORT",
    });

    await engine.placeLimitOrder("BUY", 1, 55_000);
    await engine.placeLimitOrder("SELL", 0.5, 65_000);

    const book = portfolioEngineRuntime.getOrderBookState();
    expect(book.bids).toHaveLength(1);
    expect(book.asks).toHaveLength(1);
    expect(book.bestBid).toBe(55_000);
    expect(book.bestAsk).toBe(65_000);
    expect(book.midPrice).toBe(60_000);
  });

  it("PositionsPanel source reflects engine positions", async () => {
    await seedAccount("acc_ui_pos");
    const engine = await portfolioEngineRuntime.start("acc_ui_pos", {
      marketPrice: 60_000,
    });

    await engine.buy(1, 60_000, 62_000);
    const positions = await portfolioEngineRuntime.getPositions(62_000);

    expect(positions).toHaveLength(1);
    expect(positions[0]?.quantity).toBe(1);
    expect(positions[0]?.avgEntry).toBe(60_000);
    expect(positions[0]?.unrealizedPnL).toBe(2_000);
  });

  it("CLASSIC ↔ EXCHANGE switch does not break shared runtime", async () => {
    await seedAccount("acc_ui_switch");
    const engine = await portfolioEngineRuntime.start("acc_ui_switch", {
      marketPrice: 60_000,
    });
    await engine.buy(1, 60_000, 60_000);

    // Classic (production) and Exchange (experimental) share the same runtime.
    const snapClassic = await portfolioEngineRuntime.getSnapshot();
    expect(snapClassic.positions).toHaveLength(1);

    const snapExchangeLab = await portfolioEngineRuntime.getSnapshot();
    expect(snapExchangeLab.accountId).toBe("acc_ui_switch");
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);
    expect(snapExchangeLab.positions[0]?.quantity).toBe(1);
  });

  it("PriceStream emits updates correctly", async () => {
    const prices: Array<number | null> = [];
    const unsubscribe = priceStream.subscribe((price) => {
      prices.push(price);
    });

    portfolioEngineRuntime.updatePrice(60_000);
    portfolioEngineRuntime.updatePrice(61_500);
    portfolioEngineRuntime.updatePrice(null);

    expect(prices).toContain(60_000);
    expect(prices).toContain(61_500);
    expect(prices).toContain(null);
    expect(priceStream.getLastPrice()).toBeNull();

    unsubscribe();
  });
});
