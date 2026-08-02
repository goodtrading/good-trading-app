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
import {
  captureEngineRuntimeMeta,
  engineRuntimeMetaStorageKey,
  loadEngineRuntimeMeta,
} from "@/lib/portfolio/bootstrap/PortfolioEngineHydrator";
import { portfolioEngineRuntime } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";

async function seedAccount(accountId: string, initialCash = 500_000): Promise<void> {
  memoryStore.delete(portfolioTradesStorageKey(accountId));
  memoryStore.delete(engineRuntimeMetaStorageKey(accountId));
  const storage = createPortfolioStorageForAccount(accountId);
  await commitGenesisLedger(storage, initialCash);
}

describe("PortfolioEngineRuntime", () => {
  beforeEach(async () => {
    memoryStore.clear();
    await portfolioEngineRuntime.resetForTests();
  });

  afterEach(async () => {
    await portfolioEngineRuntime.resetForTests();
  });

  it("persists trades across remount (stop/start)", async () => {
    await seedAccount("acc_a");

    const engine1 = await portfolioEngineRuntime.start("acc_a", { marketPrice: 60_000 });
    await engine1.buy(1, 60_000, 60_000);
    expect((await engine1.getState(60_000)).trades).toHaveLength(1);

    await portfolioEngineRuntime.stop("acc_a");

    const engine2 = await portfolioEngineRuntime.start("acc_a", { marketPrice: 60_000 });
    const state = await engine2.getState(60_000);

    expect(state.trades).toHaveLength(1);
    expect(state.positions[0]?.quantity).toBe(1);
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);
  });

  it("switching accounts does not duplicate RiskScheduler", async () => {
    await seedAccount("acc_a");
    await seedAccount("acc_b");

    await portfolioEngineRuntime.start("acc_a", { marketPrice: 60_000 });
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);

    await portfolioEngineRuntime.switchAccount("acc_b", { marketPrice: 61_000 });
    expect(portfolioEngineRuntime.getActiveAccountId()).toBe("acc_b");
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);
    expect(portfolioEngineRuntime.getEngineIfStarted("acc_a")).toBeNull();
  });

  it("hydration restores leverage, positionMode and limit orders", async () => {
    await seedAccount("acc_h");

    const engine1 = await portfolioEngineRuntime.start("acc_h", {
      marketPrice: 60_000,
      leverage: 2,
      positionMode: "LONG_SHORT",
    });

    engine1.reattachLimitOrders([
      {
        id: "order_limit_restore_1",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        quantity: 1,
        price: 55_000,
        status: "OPEN",
        createdAt: Date.now(),
      },
    ]);
    engine1.setLeverage(3);
    engine1.setPositionMode("LONG_SHORT");
    await captureEngineRuntimeMeta("acc_h", engine1);

    await portfolioEngineRuntime.stop("acc_h");

    const meta = await loadEngineRuntimeMeta("acc_h");
    expect(meta.leverage).toBe(3);
    expect(meta.positionMode).toBe("LONG_SHORT");
    expect(meta.openLimitOrders).toHaveLength(1);

    const engine2 = await portfolioEngineRuntime.start("acc_h", { marketPrice: 60_000 });
    expect(engine2.getLeverage()).toBe(3);
    expect(engine2.getPositionMode()).toBe("LONG_SHORT");
    expect(engine2.snapshotLimitOrders()).toHaveLength(1);
    expect(engine2.snapshotLimitOrders()[0]?.id).toBe("order_limit_restore_1");
  });

  it("liquidation still works after restart via RiskScheduler", async () => {
    await seedAccount("acc_liq");

    const engine1 = await portfolioEngineRuntime.start("acc_liq", {
      marketPrice: 60_000,
      leverage: 2,
    });
    engine1.setMarginMode("ISOLATED");
    await engine1.buy(1, 60_000, 60_000);
    await portfolioEngineRuntime.stop("acc_liq");

    const engine2 = await portfolioEngineRuntime.start("acc_liq", {
      marketPrice: 60_000,
      leverage: 2,
    });
    engine2.setMarginMode("ISOLATED");
    expect((await engine2.getState(60_000)).positions).toHaveLength(1);

    portfolioEngineRuntime.updatePrice(30_000);
    const bootstrap = portfolioEngineRuntime.getRuntime("acc_liq");
    await bootstrap!.getRiskScheduler().tick();

    const state = await engine2.getState(30_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
  });

  it("stop clears risk intervals (no scheduler leak)", async () => {
    await seedAccount("acc_leak");

    await portfolioEngineRuntime.start("acc_leak", { marketPrice: 60_000 });
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);

    await portfolioEngineRuntime.stop("acc_leak");
    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(0);
    expect(portfolioEngineRuntime.getActiveAccountId()).toBeNull();
  });
});
