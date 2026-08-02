import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import {
  accumulateLegFromTrades,
  buildHedgePositions,
} from "@/lib/portfolio/hedge/hedgePositionEngine";
import {
  reduceOnlyQuantityMode,
  resolveReduceOnlyPositionQuantity,
} from "@/lib/portfolio/hedge/resolveReduceOnlyContext";
import { createPortfolioEngine, deriveEngineState } from "@/lib/portfolio/portfolioEngine";
import {
  assertReduceOnlyExecution,
  validateReduceOnly,
} from "@/lib/portfolio/reduceOnly/ReduceOnlyValidator";
import type { Trade } from "@/lib/portfolio/types";

const MARK = 50_000;
const DEFAULTS = { leverage: 10, marginMode: "CROSS" as const };

function trade(partial: Partial<Trade> & Pick<Trade, "side" | "quantity" | "price">): Trade {
  return {
    id: `t-${partial.timestamp ?? Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: PORTFOLIO_V1_SYMBOL,
    timestamp: partial.timestamp ?? Date.now(),
    source: "PAPER",
    fees: createZeroTradeFees(),
    ...partial,
  };
}

describe("hedgePositionEngine", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("opens independent LONG and SHORT legs without netting", () => {
    const trades: Trade[] = [
      trade({ side: "BUY", quantity: 0.1, price: 48_000, positionSide: "LONG", timestamp: 1 }),
      trade({ side: "SELL", quantity: 0.05, price: 49_000, positionSide: "SHORT", timestamp: 2 }),
    ];

    const legs = buildHedgePositions(trades, MARK, DEFAULTS);
    expect(legs).toHaveLength(2);

    const longLeg = legs.find((l) => l.side === "LONG");
    const shortLeg = legs.find((l) => l.side === "SHORT");

    expect(longLeg?.quantity).toBe(0.1);
    expect(shortLeg?.quantity).toBe(0.05);
    expect(longLeg?.avgEntry).toBe(48_000);
    expect(shortLeg?.avgEntry).toBe(49_000);
  });

  it("closes one leg without affecting the other", () => {
    const trades: Trade[] = [
      trade({ side: "BUY", quantity: 0.2, price: 40_000, positionSide: "LONG", timestamp: 1 }),
      trade({ side: "SELL", quantity: 0.1, price: 41_000, positionSide: "SHORT", timestamp: 2 }),
      trade({ side: "SELL", quantity: 0.05, price: 42_000, positionSide: "LONG", reduceOnly: true, timestamp: 3 }),
    ];

    const legs = buildHedgePositions(trades, MARK, DEFAULTS);
    const longLeg = legs.find((l) => l.side === "LONG");
    const shortLeg = legs.find((l) => l.side === "SHORT");

    expect(longLeg?.quantity).toBe(0.15);
    expect(shortLeg?.quantity).toBe(0.1);
    expect(accumulateLegFromTrades(trades, "LONG").realizedPnL).toBeCloseTo(0.05 * (42_000 - 40_000));
  });

  it("deriveEngineState returns two positions in HEDGE mode", () => {
    const trades: Trade[] = [
      trade({ side: "BUY", quantity: 0.1, price: 48_000, positionSide: "LONG", timestamp: 1 }),
      trade({ side: "SELL", quantity: 0.08, price: 49_000, positionSide: "SHORT", timestamp: 2 }),
    ];

    const state = deriveEngineState(
      { initialCashBalance: 10_000, walletCash: 10_000, trades, orders: [], fills: [] },
      MARK,
      10,
      "CROSS",
      "HEDGE",
    );

    expect(state.positions).toHaveLength(2);
    expect(state.positions.every((p) => p.quantity > 0)).toBe(true);
  });

  it("PortfolioEngine executes dual-leg flow in HEDGE mode", async () => {
    const storage = createPortfolioStorageForAccount("hedge-wallet-1");
    await commitGenesisLedger(storage, 50_000);
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      accountPositionMode: "HEDGE",
      leverage: 10,
    });

    await engine.buy(0.1, MARK, MARK);
    await engine.sell(0.05, MARK, MARK);

    const state = await engine.getState(MARK);
    expect(state.positions).toHaveLength(2);

    const longQty = state.positions.find((p) => p.side === "LONG")?.quantity ?? 0;
    const shortQty = state.positions.find((p) => p.side === "SHORT")?.quantity ?? 0;
    expect(longQty).toBe(0.1);
    expect(shortQty).toBe(0.05);
  });

  it("reduce-only validates per leg in HEDGE mode", () => {
    const positions = buildHedgePositions(
      [
        trade({ side: "BUY", quantity: 0.2, price: 40_000, positionSide: "LONG", timestamp: 1 }),
        trade({ side: "SELL", quantity: 0.1, price: 41_000, positionSide: "SHORT", timestamp: 2 }),
      ],
      MARK,
      DEFAULTS,
    );

    const longQty = resolveReduceOnlyPositionQuantity(positions, "HEDGE", PORTFOLIO_V1_SYMBOL, "SELL");
    expect(longQty).toBe(0.2);

    const shortQty = resolveReduceOnlyPositionQuantity(positions, "HEDGE", PORTFOLIO_V1_SYMBOL, "BUY");
    expect(shortQty).toBe(0.1);

    const mode = reduceOnlyQuantityMode("HEDGE");
    expect(
      assertReduceOnlyExecution({
        positionQuantity: longQty,
        side: "SELL",
        requestedQuantity: 0.05,
        quantityMode: mode,
      }),
    ).toBe(0.05);

    const rejected = validateReduceOnly({
      positionQuantity: 0,
      side: "SELL",
      requestedQuantity: 0.01,
      quantityMode: mode,
    });
    expect(rejected.allowed).toBe(false);

    const shortOnly = buildHedgePositions(
      [trade({ side: "SELL", quantity: 0.1, price: 41_000, positionSide: "SHORT", timestamp: 1 })],
      MARK,
      DEFAULTS,
    );
    expect(
      resolveReduceOnlyPositionQuantity(shortOnly, "HEDGE", PORTFOLIO_V1_SYMBOL, "SELL"),
    ).toBe(0);
  });

  it("derivePerpWalletMetrics aggregates wallet metrics across hedge legs", () => {
    const trades: Trade[] = [
      trade({ side: "BUY", quantity: 0.1, price: 48_000, positionSide: "LONG", timestamp: 1 }),
      trade({ side: "SELL", quantity: 0.05, price: 49_000, positionSide: "SHORT", timestamp: 2 }),
    ];

    const { positions, snapshot } = derivePerpWalletMetrics({
      accountId: "acc-1",
      initialCashBalance: 10_000,
      walletCash: 10_000,
      realizedPnL: 0,
      trades,
      markPrice: MARK,
      accountPositionMode: "HEDGE",
    });

    expect(positions).toHaveLength(2);
    expect(snapshot.marginUsed).toBeGreaterThan(0);
    expect(snapshot.maxReducibleQuantity).toBeCloseTo(0.15);
    expect(snapshot.canReduce).toBe(true);
  });

  it("ONE_WAY mode preserves net behavior (regression)", () => {
    const trades: Trade[] = [
      trade({ side: "BUY", quantity: 0.2, price: 40_000, timestamp: 1 }),
      trade({ side: "SELL", quantity: 0.05, price: 41_000, timestamp: 2 }),
    ];

    const state = deriveEngineState(
      { initialCashBalance: 10_000, walletCash: 10_000, trades, orders: [], fills: [] },
      MARK,
      10,
      "CROSS",
      "ONE_WAY",
    );

    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].quantity).toBeCloseTo(0.15);
  });
});
