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
import { spotPositionEngine } from "@/lib/portfolio/spot/SpotPositionEngine";
import { spotPositionStorage } from "@/lib/portfolio/spot/SpotPositionStorage";
import {
  closeQuantityFromPercent,
  isEffectivelyZero,
  isFullClose,
  resolveCanonicalCloseQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import { dustEpsilon } from "@/lib/portfolio/symbols/symbolRules";

type SymbolCase = {
  symbol: string;
  baseAsset: string;
  buyQty: number;
  lockQty?: number;
  price: number;
};

const SYMBOL_CASES: SymbolCase[] = [
  { symbol: "BTCUSDT", baseAsset: "BTC", buyQty: 0.0365, lockQty: 0.0288, price: 50_000 },
  { symbol: "ETHUSDT", baseAsset: "ETH", buyQty: 0.1234, lockQty: 0.1, price: 3_000 },
  { symbol: "SOLUSDT", baseAsset: "SOL", buyQty: 12.34, lockQty: 10, price: 150 },
  { symbol: "XRPUSDT", baseAsset: "XRP", buyQty: 150, lockQty: 100, price: 2 },
];

async function bootstrapSpot(walletId: string, initialUsdt = 100_000) {
  spotLedgerRuntime.stopAll();
  spotPositionRuntime.stopAll();
  memoryStore.clear();
  await spotLedgerRuntime.start(walletId, { initialUsdt });
  await spotPositionRuntime.start(walletId);
}

async function buy(
  walletId: string,
  baseAsset: string,
  quantity: number,
  price = 1_000,
) {
  const ledger = spotLedgerRuntime.getLedger(walletId)!;
  await new SpotExecutionService(ledger).buyMarket({
    baseAsset,
    quantity,
    price,
  });
}

function trade(
  walletId: string,
  side: "BUY" | "SELL",
  baseAsset: string,
  quantity: number,
  price: number,
) {
  return {
    id: `t_${side}_${baseAsset}_${quantity}`,
    domain: "SPOT" as const,
    walletId,
    baseAsset,
    quoteAsset: "USDT",
    side,
    quantity,
    price,
    quoteQuantity: quantity * price,
    timestamp: Date.now(),
  };
}

describe("Canonical position close", () => {
  const walletId = "canonical_close";

  beforeEach(async () => {
    await bootstrapSpot(walletId);
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
    spotPositionRuntime.stopAll();
  });

  it.each(SYMBOL_CASES)(
    "full close with TP blocking funds ($symbol)",
    async ({ symbol, baseAsset, buyQty, lockQty, price }) => {
      await buy(walletId, baseAsset, buyQty, price);
      await spotOrderRegistry.registerSellLimit(walletId, {
        baseAsset,
        quantity: lockQty!,
        limitPrice: 2_000,
        purpose: "TAKE_PROFIT",
        positionAsset: baseAsset,
      });

      await spotPositionService.closePosition(walletId, symbol, price * 1.1);

      expect(spotPositionRuntime.listOpen(walletId)).toHaveLength(0);
      const stored = await spotPositionStorage.load(walletId);
      const row = stored.find((p) => p.symbol === symbol);
      expect(row?.status).toBe("CLOSED");
      expect(row?.quantity).toBe(0);
    },
  );

  it.each(SYMBOL_CASES)(
    "full close with LIMIT SELL ($symbol)",
    async ({ symbol, baseAsset, buyQty, lockQty, price }) => {
      await buy(walletId, baseAsset, buyQty, price);
      await spotOrderRegistry.registerSellLimit(walletId, {
        baseAsset,
        quantity: lockQty!,
        limitPrice: 2_000,
      });

      await spotPositionService.closePosition(walletId, symbol, price * 1.1);

      const row = (await spotPositionStorage.load(walletId)).find(
        (p) => p.symbol === symbol,
      );
      expect(row?.status).toBe("CLOSED");
      expect(row?.quantity).toBe(0);
    },
  );

  it("partial close keeps position OPEN with normalized quantity", async () => {
    await buy(walletId, "BTC", 0.1);
    const ledger = spotLedgerRuntime.getLedger(walletId)!;
    await new SpotExecutionService(ledger).sellMarket({
      baseAsset: "BTC",
      quantity: closeQuantityFromPercent("BTCUSDT", 0.1, 50),
      price: 1_100,
    });

    const open = spotPositionRuntime.listOpen(walletId);
    expect(open).toHaveLength(1);
    expect(open[0]!.quantity).toBeCloseTo(0.05, 8);
    expect(open[0]!.status).toBe("OPEN");
  });

  it("MAX / 100% uses resolveCanonicalCloseQuantity", () => {
    const qty = resolveCanonicalCloseQuantity({
      symbol: "BTCUSDT",
      quantity: 0.0365,
    });
    expect(isFullClose("BTCUSDT", qty, 0.0365)).toBe(true);
  });

  it("dust residual closes position after sell", async () => {
    let positions = spotPositionEngine.applyTrade(
      [],
      trade(walletId, "BUY", "BTC", 0.000019, 50_000),
    );
    positions = spotPositionEngine.applyTrade(
      positions,
      trade(walletId, "SELL", "BTC", 0.00001, 50_000),
    );

    const row = positions.find((p) => p.symbol === "BTCUSDT");
    expect(row?.status).toBe("CLOSED");
    expect(row?.quantity).toBe(0);
  });

  it("quantity below dust epsilon is effectively zero", () => {
    const eps = dustEpsilon("BTCUSDT");
    expect(isEffectivelyZero("BTCUSDT", eps)).toBe(true);
    expect(isEffectivelyZero("BTCUSDT", eps * 2)).toBe(false);
  });

  it("quantity exactly at stepSize is valid", () => {
    expect(isEffectivelyZero("BTCUSDT", 0.00001)).toBe(false);
    expect(resolveCanonicalCloseQuantity({ symbol: "BTCUSDT", quantity: 0.00001 })).toBe(
      0.00001,
    );
  });

  it("full close updates existing row — no duplicate position", async () => {
    await buy(walletId, "BTC", 0.05);
    const before = await spotPositionStorage.load(walletId);
    const positionId = before.find((p) => p.symbol === "BTCUSDT")?.id;
    expect(positionId).toBeTruthy();

    await spotPositionService.closePosition(walletId, "BTCUSDT", 1_100);

    const after = await spotPositionStorage.load(walletId);
    const closed = after.filter((p) => p.symbol === "BTCUSDT");
    expect(closed).toHaveLength(1);
    expect(closed[0]!.id).toBe(positionId);
    expect(closed[0]!.status).toBe("CLOSED");
    expect(closed[0]!.realizedPnL).not.toBe(0);
    expect(closed[0]!.averageEntry).toBeGreaterThan(0);
  });
});
