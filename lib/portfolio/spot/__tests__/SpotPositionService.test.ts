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

import { SpotExecutionService } from "@/lib/portfolio/spot/SpotExecutionService";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotOrderRegistry } from "@/lib/portfolio/spot/orders/SpotOrderRegistry";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";
import { spotPositionService } from "@/lib/portfolio/spot/SpotPositionService";

describe("SpotPositionService.closePosition", () => {
  const walletId = "close_wallet";

  beforeEach(async () => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
    spotPositionRuntime.stopAll();
    await spotLedgerRuntime.start(walletId, { initialUsdt: 10_000 });
    await spotPositionRuntime.start(walletId);
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
    spotPositionRuntime.stopAll();
  });

  it("sells full position quantity after unlocking TP limit inventory", async () => {
    const ledger = spotLedgerRuntime.getLedger(walletId)!;
    await new SpotExecutionService(ledger).buyMarket({
      baseAsset: "BTC",
      quantity: 0.0365,
      price: 50_000,
    });

    await spotOrderRegistry.registerSellLimit(walletId, {
      baseAsset: "BTC",
      quantity: 0.0288,
      limitPrice: 70_000,
      purpose: "TAKE_PROFIT",
      positionAsset: "BTC",
    });

    const before = ledger.getState()!;
    expect(before.balances.find((b) => b.asset === "BTC")?.free).toBeCloseTo(0.0077, 6);

    const { state } = await spotPositionService.closePosition(
      walletId,
      "BTCUSDT",
      60_000,
    );

    const btc = state.balances.find((b) => b.asset === "BTC");
    expect(btc?.free ?? 0).toBe(0);
    expect(btc?.locked ?? 0).toBe(0);
    expect(spotPositionRuntime.listOpen(walletId)).toHaveLength(0);
  });
});
