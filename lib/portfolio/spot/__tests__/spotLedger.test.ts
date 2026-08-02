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
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import {
  spotBalancesStorageKey,
  spotOrdersStorageKey,
  spotTradesStorageKey,
} from "@/lib/portfolio/spot/storageKeys";
import { createSpotBalance } from "@/lib/portfolio/spot/types";

describe("SpotLedger (Phase 4 greenfield)", () => {
  beforeEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  it("creates an empty ledger with optional USDT balance", async () => {
    const ledger = new SpotLedger("wallet_spot_1");
    const state = await ledger.createEmpty(1_000);

    expect(state.walletId).toBe("wallet_spot_1");
    expect(state.trades).toEqual([]);
    expect(state.orders).toEqual([]);
    expect(state.balances).toHaveLength(1);
    expect(state.balances[0]).toEqual({
      asset: "USDT",
      free: 1_000,
      locked: 0,
      total: 1_000,
    });

    expect(memoryStore.has(spotBalancesStorageKey("wallet_spot_1"))).toBe(true);
    expect(memoryStore.has(spotTradesStorageKey("wallet_spot_1"))).toBe(true);
    expect(memoryStore.has(spotOrdersStorageKey("wallet_spot_1"))).toBe(true);
  });

  it("loads and saves full state", async () => {
    const ledger = new SpotLedger("wallet_spot_2");
    await ledger.createEmpty(500);

    await ledger.persistBalances([
      createSpotBalance("USDT", 400, 100),
      createSpotBalance("BTC", 0.5, 0),
    ]);

    await ledger.persistTrades([
      {
        id: "st_1",
        domain: "SPOT",
        walletId: "wallet_spot_2",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        side: "BUY",
        quantity: 0.5,
        price: 50_000,
        quoteQuantity: 25_000,
        timestamp: 1,
      },
    ]);

    const reloaded = new SpotLedger("wallet_spot_2");
    const state = await reloaded.load();

    expect(state?.balances).toHaveLength(2);
    expect(state?.balances.find((b) => b.asset === "USDT")?.total).toBe(500);
    expect(state?.balances.find((b) => b.asset === "BTC")?.free).toBe(0.5);
    expect(state?.trades).toHaveLength(1);
    expect(state?.trades[0]?.domain).toBe("SPOT");
  });

  it("runtime start/stop isolates ledgers per wallet", async () => {
    const a = await spotLedgerRuntime.start("acc_a", { initialUsdt: 100 });
    const b = await spotLedgerRuntime.start("acc_b", { initialUsdt: 200 });

    expect(a.getState()?.balances[0]?.free).toBe(100);
    expect(b.getState()?.balances[0]?.free).toBe(200);

    spotLedgerRuntime.stop("acc_a");
    expect(spotLedgerRuntime.getLedger("acc_a")).toBeNull();
    expect(spotLedgerRuntime.getLedger("acc_b")).not.toBeNull();
  });

  it("does not use PERP storage keys", async () => {
    const ledger = new SpotLedger("wallet_keys");
    await ledger.createEmpty(10);

    const keys = [...memoryStore.keys()];
    expect(keys.every((key) => key.includes("/spot/"))).toBe(true);
    expect(keys.some((key) => key.endsWith("/trades/v1") && !key.includes("/spot/"))).toBe(
      false,
    );
    expect(keys.some((key) => key.endsWith("/orders/v1") && !key.includes("/spot/"))).toBe(
      false,
    );
  });
});
