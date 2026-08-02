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

import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import {
  SpotExecutionService,
  SpotInsufficientBalanceError,
} from "@/lib/portfolio/spot/SpotExecutionService";

describe("SpotExecutionService MARKET", () => {
  let ledger: SpotLedger;
  let execution: SpotExecutionService;

  beforeEach(async () => {
    memoryStore.clear();
    ledger = new SpotLedger("spot_exec_1");
    await ledger.createEmpty(10_000);
    execution = new SpotExecutionService(ledger);
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it("BUY MARKET spends USDT and credits base asset", async () => {
    const { trade, state } = await execution.buyMarket({
      baseAsset: "BTC",
      quantity: 0.1,
      price: 50_000,
    });

    expect(trade.domain).toBe("SPOT");
    expect(trade.side).toBe("BUY");
    expect(trade.quoteQuantity).toBe(5_000);

    const usdt = state.balances.find((b) => b.asset === "USDT");
    const btc = state.balances.find((b) => b.asset === "BTC");
    expect(usdt?.free).toBe(5_000);
    expect(btc?.free).toBe(0.1);
    expect(state.trades).toHaveLength(1);

    // No position-like fields on trade
    expect("leverage" in trade).toBe(false);
    expect("marginMode" in trade).toBe(false);
    expect("positionMode" in trade).toBe(false);
  });

  it("SELL MARKET spends base and credits USDT", async () => {
    await execution.buyMarket({ baseAsset: "BTC", quantity: 0.2, price: 50_000 });

    const { trade, state } = await execution.sellMarket({
      baseAsset: "BTC",
      quantity: 0.1,
      price: 60_000,
    });

    expect(trade.side).toBe("SELL");
    expect(trade.quoteQuantity).toBe(6_000);

    const usdt = state.balances.find((b) => b.asset === "USDT");
    const btc = state.balances.find((b) => b.asset === "BTC");
    // started 10k, bought 0.2 @ 50k = -10k, sold 0.1 @ 60k = +6k → 6k USDT
    expect(usdt?.free).toBe(6_000);
    expect(btc?.free).toBeCloseTo(0.1);
  });

  it("rejects BUY when USDT is insufficient", async () => {
    await expect(
      execution.buyMarket({ baseAsset: "BTC", quantity: 1, price: 50_000 }),
    ).rejects.toThrow(SpotInsufficientBalanceError);
  });

  it("rejects SELL when base free balance is insufficient (no SHORT)", async () => {
    await expect(
      execution.sellMarket({ baseAsset: "BTC", quantity: 0.01, price: 50_000 }),
    ).rejects.toThrow(SpotInsufficientBalanceError);

    await execution.buyMarket({ baseAsset: "BTC", quantity: 0.1, price: 50_000 });

    await expect(
      execution.sellMarket({ baseAsset: "BTC", quantity: 0.2, price: 50_000 }),
    ).rejects.toThrow(SpotInsufficientBalanceError);

    // Balance unchanged after rejected oversell
    const state = ledger.getState();
    expect(state?.balances.find((b) => b.asset === "BTC")?.free).toBe(0.1);
  });

  it("persists balances and trades across reload", async () => {
    await execution.buyMarket({ baseAsset: "ETH", quantity: 2, price: 2_000 });

    const reloaded = new SpotLedger("spot_exec_1");
    const state = await reloaded.load();
    expect(state?.balances.find((b) => b.asset === "ETH")?.free).toBe(2);
    expect(state?.balances.find((b) => b.asset === "USDT")?.free).toBe(6_000);
    expect(state?.trades).toHaveLength(1);
  });
});

describe("SpotExecutionService SELL unlock", () => {
  beforeEach(async () => {
    memoryStore.clear();
    const { spotLedgerRuntime } = await import(
      "@/lib/portfolio/spot/SpotLedgerRuntime"
    );
    spotLedgerRuntime.stopAll();
    await spotLedgerRuntime.start("sell_unlock", { initialUsdt: 10_000 });
  });

  afterEach(async () => {
    memoryStore.clear();
    const { spotLedgerRuntime } = await import(
      "@/lib/portfolio/spot/SpotLedgerRuntime"
    );
    spotLedgerRuntime.stopAll();
  });

  it("unlocks open sell limits when free base is insufficient", async () => {
    const { spotLedgerRuntime } = await import(
      "@/lib/portfolio/spot/SpotLedgerRuntime"
    );
    const { spotOrderRegistry } = await import(
      "@/lib/portfolio/spot/orders/SpotOrderRegistry"
    );

    const runtimeLedger = spotLedgerRuntime.getLedger("sell_unlock")!;
    const runtimeExecution = new SpotExecutionService(runtimeLedger);

    await runtimeExecution.buyMarket({ baseAsset: "BTC", quantity: 0.1, price: 50_000 });
    await spotOrderRegistry.registerSellLimit("sell_unlock", {
      baseAsset: "BTC",
      quantity: 0.08,
      limitPrice: 70_000,
    });

    expect(runtimeLedger.getState()?.balances.find((b) => b.asset === "BTC")?.free).toBeCloseTo(
      0.02,
      6,
    );

    const { state } = await runtimeExecution.sellMarket({
      baseAsset: "BTC",
      quantity: 0.1,
      price: 60_000,
    });

    expect(state.balances.find((b) => b.asset === "BTC")?.free ?? 0).toBe(0);
  });
});
