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
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { assertLedgerIntegrity } from "@/lib/cartera/ledger/LedgerEntrySchema";

async function seedAccount(accountId: string, initialCash = 500_000): Promise<void> {
  memoryStore.delete(portfolioTradesStorageKey(accountId));
  memoryStore.delete(engineRuntimeMetaStorageKey(accountId));
  const storage = createPortfolioStorageForAccount(accountId);
  await commitGenesisLedger(storage, initialCash);
}

describe("Portfolio snapshots + rollback", () => {
  beforeEach(async () => {
    memoryStore.clear();
    await portfolioEngineRuntime.resetForTests();
  });

  afterEach(async () => {
    await portfolioEngineRuntime.resetForTests();
  });

  it("creates a snapshot on trade", async () => {
    await seedAccount("acc_snap_trade");
    const engine = await portfolioEngineRuntime.start("acc_snap_trade", {
      marketPrice: 60_000,
    });

    await engine.buy(1, 60_000, 60_000);

    const latest = portfolioEngineRuntime.getSnapshotService().getLatest("acc_snap_trade");
    expect(latest).not.toBeNull();
    expect(latest?.reason).toBe("trade_executed");
    expect(latest?.trades).toHaveLength(1);
    expect(latest?.positions[0]?.quantity).toBe(1);
    expect(latest?.engineVersion).toBe(portfolioEngineRuntime.getEngineVersion());
  });

  it("creates a snapshot on liquidation", async () => {
    await seedAccount("acc_snap_liq");
    const engine = await portfolioEngineRuntime.start("acc_snap_liq", {
      marketPrice: 60_000,
      leverage: 2,
    });
    engine.setMarginMode("ISOLATED");

    await engine.buy(1, 60_000, 60_000);
    const afterTrade = portfolioEngineRuntime.getSnapshotService().list("acc_snap_liq");
    expect(afterTrade.some((snap) => snap.reason === "trade_executed")).toBe(true);

    portfolioEngineRuntime.updatePrice(30_000);
    const bootstrap = portfolioEngineRuntime.getRuntime("acc_snap_liq");
    await bootstrap!.getRiskScheduler().tick();

    const snapshots = portfolioEngineRuntime.getSnapshotService().list("acc_snap_liq");
    expect(snapshots.some((snap) => snap.reason === "liquidation")).toBe(true);

    const latest = portfolioEngineRuntime.getSnapshotService().getLatest("acc_snap_liq");
    expect(latest?.positions).toHaveLength(0);
    expect(latest?.trades).toHaveLength(2);
  });

  it("rollback restores positions correctly", async () => {
    await seedAccount("acc_snap_rb");
    const engine = await portfolioEngineRuntime.start("acc_snap_rb", {
      marketPrice: 60_000,
    });

    await engine.buy(1, 60_000, 60_000);
    const snapshot = portfolioEngineRuntime.getSnapshotService().getLatest("acc_snap_rb");
    expect(snapshot).not.toBeNull();

    await engine.buy(1, 70_000, 70_000);
    expect((await engine.getState(70_000)).positions[0]?.quantity).toBe(2);

    const restored = await portfolioEngineRuntime.rollback(snapshot!.id);
    const state = await restored.getState(60_000);

    expect(state.positions[0]?.quantity).toBe(1);
    expect(state.positions[0]?.avgEntry).toBe(60_000);
    expect(state.trades).toHaveLength(1);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
  });

  it("rollback does not duplicate RiskScheduler", async () => {
    await seedAccount("acc_snap_sched");
    const engine = await portfolioEngineRuntime.start("acc_snap_sched", {
      marketPrice: 60_000,
    });
    await engine.buy(1, 60_000, 60_000);
    const snapshot = portfolioEngineRuntime.getSnapshotService().getLatest("acc_snap_sched");

    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);

    await portfolioEngineRuntime.rollback(snapshot!.id);

    expect(portfolioEngineRuntime.countRunningSchedulers()).toBe(1);
    expect(portfolioEngineRuntime.getActiveAccountId()).toBe("acc_snap_sched");
  });

  it("rollback maintains ledger integrity", async () => {
    await seedAccount("acc_snap_integrity");
    const engine = await portfolioEngineRuntime.start("acc_snap_integrity", {
      marketPrice: 60_000,
    });

    await engine.buy(1, 60_000, 60_000);
    const snapshot = portfolioEngineRuntime.getSnapshotService().getLatest("acc_snap_integrity");
    await engine.sell(1, 65_000, 65_000);

    const restored = await portfolioEngineRuntime.rollback(snapshot!.id);
    const state = await restored.getState(60_000);

    expect(() =>
      assertLedgerIntegrity(state.trades, state.walletCash),
    ).not.toThrow();
    expect(state.trades).toHaveLength(1);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
  });
});
