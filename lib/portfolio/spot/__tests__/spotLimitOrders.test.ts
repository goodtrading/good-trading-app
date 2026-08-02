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

import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import {
  shouldFillSpotLimit,
  createSpotOrderEvaluator,
} from "@/lib/portfolio/spot/orders/SpotOrderEvaluator";
import { spotOrderRegistry } from "@/lib/portfolio/spot/orders/SpotOrderRegistry";

describe("Spot LIMIT orders", () => {
  beforeEach(async () => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
    await spotLedgerRuntime.start("lim_wallet", { initialUsdt: 10_000 });
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  it("BUY LIMIT locks USDT (free↓ locked↑ total constant)", async () => {
    const before = await spotLedgerRuntime.getState("lim_wallet");
    const usdtBefore = before!.balances.find((b) => b.asset === "USDT")!;

    const { order, state } = await spotOrderRegistry.registerBuyLimit("lim_wallet", {
      baseAsset: "BTC",
      quantity: 0.1,
      limitPrice: 50_000,
    });

    expect(order.status).toBe("PENDING");
    expect(order.orderType).toBe("LIMIT");
    expect(order.side).toBe("BUY");

    const usdt = state.balances.find((b) => b.asset === "USDT")!;
    expect(usdt.free).toBe(5_000);
    expect(usdt.locked).toBe(5_000);
    expect(usdt.total).toBe(usdtBefore.total);
    expect(state.trades).toHaveLength(0);
  });

  it("SELL LIMIT locks base asset", async () => {
    // Acquire BTC first via market buy path on ledger balances
    const { SpotExecutionService } = await import(
      "@/lib/portfolio/spot/SpotExecutionService"
    );
    const ledger = spotLedgerRuntime.getLedger("lim_wallet")!;
    await new SpotExecutionService(ledger).buyMarket({
      baseAsset: "BTC",
      quantity: 0.2,
      price: 50_000,
    });

    const before = ledger.getState()!;
    const btcBefore = before.balances.find((b) => b.asset === "BTC")!;

    const { state } = await spotOrderRegistry.registerSellLimit("lim_wallet", {
      baseAsset: "BTC",
      quantity: 0.1,
      limitPrice: 60_000,
    });

    const btc = state.balances.find((b) => b.asset === "BTC")!;
    expect(btc.free).toBeCloseTo(0.1);
    expect(btc.locked).toBeCloseTo(0.1);
    expect(btc.total).toBeCloseTo(btcBefore.total);
    expect(state.trades).toHaveLength(1); // only the prior market buy
  });

  it("BUY LIMIT fill releases locked USDT and credits BTC", async () => {
    const { order } = await spotOrderRegistry.registerBuyLimit("lim_wallet", {
      baseAsset: "BTC",
      quantity: 0.1,
      limitPrice: 50_000,
    });

    const { order: filled, state, trade } = await spotOrderRegistry.fill(
      "lim_wallet",
      order.id,
    );

    expect(filled.status).toBe("FILLED");
    expect(trade?.side).toBe("BUY");
    expect(trade?.domain).toBe("SPOT");

    const usdt = state.balances.find((b) => b.asset === "USDT")!;
    const btc = state.balances.find((b) => b.asset === "BTC")!;
    expect(usdt.free).toBe(5_000);
    expect(usdt.locked).toBe(0);
    expect(usdt.total).toBe(5_000);
    expect(btc.free).toBe(0.1);
    expect(state.trades).toHaveLength(1);
  });

  it("SELL LIMIT fill releases locked BTC and credits USDT", async () => {
    const { SpotExecutionService } = await import(
      "@/lib/portfolio/spot/SpotExecutionService"
    );
    const ledger = spotLedgerRuntime.getLedger("lim_wallet")!;
    await new SpotExecutionService(ledger).buyMarket({
      baseAsset: "BTC",
      quantity: 0.2,
      price: 50_000,
    });

    const { order } = await spotOrderRegistry.registerSellLimit("lim_wallet", {
      baseAsset: "BTC",
      quantity: 0.1,
      limitPrice: 60_000,
    });

    const { state, trade } = await spotOrderRegistry.fill("lim_wallet", order.id);
    expect(trade?.side).toBe("SELL");

    const usdt = state.balances.find((b) => b.asset === "USDT")!;
    const btc = state.balances.find((b) => b.asset === "BTC")!;
    // after buy: 0 USDT, 0.2 BTC; sell 0.1 @ 60k → 6k USDT, 0.1 BTC free
    expect(usdt.free).toBe(6_000);
    expect(btc.free).toBeCloseTo(0.1);
    expect(btc.locked).toBe(0);
  });

  it("cancel unlocks balances without creating trades", async () => {
    const { order } = await spotOrderRegistry.registerBuyLimit("lim_wallet", {
      baseAsset: "ETH",
      quantity: 1,
      limitPrice: 2_000,
    });

    const { order: cancelled, state } = await spotOrderRegistry.cancel(
      "lim_wallet",
      order.id,
    );

    expect(cancelled.status).toBe("CANCELLED");
    const usdt = state.balances.find((b) => b.asset === "USDT")!;
    expect(usdt.free).toBe(10_000);
    expect(usdt.locked).toBe(0);
    expect(usdt.total).toBe(10_000);
    expect(state.trades).toHaveLength(0);
  });

  it("evaluator fills BUY when price drops to limit", async () => {
    await spotOrderRegistry.registerBuyLimit("lim_wallet", {
      baseAsset: "BTC",
      quantity: 0.1,
      limitPrice: 50_000,
    });

    let price = 55_000;
    const evaluator = createSpotOrderEvaluator({
      walletId: "lim_wallet",
      getPrice: () => price,
    });

    await evaluator.tick();
    expect(await spotOrderRegistry.listOpen("lim_wallet")).toHaveLength(1);

    price = 50_000;
    await evaluator.tick();

    expect(await spotOrderRegistry.listOpen("lim_wallet")).toHaveLength(0);
    const state = await spotLedgerRuntime.getState("lim_wallet");
    expect(state?.balances.find((b) => b.asset === "BTC")?.free).toBe(0.1);
    expect(state?.trades).toHaveLength(1);
  });

  it("shouldFillSpotLimit encodes buy/sell rules", () => {
    expect(shouldFillSpotLimit("BUY", 50_000, 49_000)).toBe(true);
    expect(shouldFillSpotLimit("BUY", 50_000, 51_000)).toBe(false);
    expect(shouldFillSpotLimit("SELL", 60_000, 61_000)).toBe(true);
    expect(shouldFillSpotLimit("SELL", 60_000, 59_000)).toBe(false);
  });
});
