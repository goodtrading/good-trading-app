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

import { bootstrapPortfolioAccount } from "@/lib/portfolio/accounts/portfolioAccountService";
import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { walletService } from "@/lib/portfolio/wallets/WalletService";

describe("WalletService", () => {
  beforeEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  it("bootstrap funds SpotWallet and leaves PerpWallet at 0", async () => {
    const account = await bootstrapPortfolioAccount("Main", 50_000);

    const spot = await walletService.getSpotWallet(account.id);
    const perp = await walletService.getPerpWallet(account.id);

    expect(spot.usdtFree).toBe(50_000);
    expect(spot.usdtTotal).toBe(50_000);
    expect(perp.walletBalance).toBe(0);
    expect(perp.walletCash).toBe(0);
    expect(perp.availableBalance).toBe(0);
    expect(perp.initialCashBalance).toBe(0);
  });

  it("transferSpotToPerp moves USDT via walletCash, not genesis", async () => {
    const account = await bootstrapPortfolioAccount("T1", 10_000);

    await walletService.transferSpotToPerp(account.id, 4_000);

    const spot = await walletService.getSpotWallet(account.id);
    const perp = await walletService.getPerpWallet(account.id);
    const persisted = await createPortfolioStorageForAccount(account.id).load();

    expect(spot.usdtFree).toBe(6_000);
    expect(perp.walletCash).toBe(4_000);
    expect(perp.walletBalance).toBe(4_000);
    expect(perp.availableBalance).toBe(4_000);
    expect(perp.initialCashBalance).toBe(0);
    expect(persisted.initialCashBalance).toBe(0);
    expect(persisted.walletCash).toBe(4_000);
    expect(persisted.trades).toHaveLength(0);
  });

  it("transferPerpToSpot moves USDT via walletCash, not genesis", async () => {
    const account = await bootstrapPortfolioAccount("T2", 10_000);
    await walletService.transferSpotToPerp(account.id, 5_000);
    await walletService.transferPerpToSpot(account.id, 2_000);

    const spot = await walletService.getSpotWallet(account.id);
    const perp = await walletService.getPerpWallet(account.id);
    const persisted = await createPortfolioStorageForAccount(account.id).load();

    expect(spot.usdtFree).toBe(7_000);
    expect(perp.walletCash).toBe(3_000);
    expect(perp.walletBalance).toBe(3_000);
    expect(perp.initialCashBalance).toBe(0);
    expect(persisted.initialCashBalance).toBe(0);
    expect(persisted.walletCash).toBe(3_000);
    expect(persisted.trades).toHaveLength(0);
  });

  it("rejects transfer when source wallet lacks USDT", async () => {
    const account = await bootstrapPortfolioAccount("T3", 100);
    await expect(
      walletService.transferSpotToPerp(account.id, 500),
    ).rejects.toThrow(/Insufficient Spot USDT/);

    await walletService.transferSpotToPerp(account.id, 100);
    await expect(
      walletService.transferPerpToSpot(account.id, 50),
    ).resolves.toBeUndefined();
    await expect(
      walletService.transferPerpToSpot(account.id, 100),
    ).rejects.toThrow(/Insufficient Perp USDT/);
  });
});
