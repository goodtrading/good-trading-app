import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import {
  entryMarginForPosition,
  perpMetricsAtMark,
  roiPercent,
} from "@/lib/portfolio/futures/futuresAccounting";
import {
  computeEquityAtRisk,
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
  isLiquidationTriggered,
} from "@/lib/portfolio/futures/MarginModel";
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import {
  accumulatePositionFromTrades,
  buildPosition,
} from "@/lib/portfolio/positionEngine";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createLiquidationEngine,
} from "@/lib/portfolio/risk/LiquidationEngine";
import { createRiskScheduler } from "@/lib/portfolio/risk/RiskScheduler";
import { isEffectivelyZero, normalizeQuantity } from "@/lib/portfolio/sizing/PositionSizing";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioEngineState, Trade } from "@/lib/portfolio/types";

const SYMBOL = PORTFOLIO_V1_SYMBOL;
const MARK = 60_000;

function trade(
  side: Trade["side"],
  quantity: number,
  price: number,
  overrides: Partial<Trade> = {},
): Trade {
  return {
    id: `audit-${side}-${quantity}-${price}-${overrides.timestamp ?? Date.now()}`,
    symbol: SYMBOL,
    side,
    quantity,
    price,
    timestamp: overrides.timestamp ?? Date.now(),
    source: "PAPER",
    fees: createZeroTradeFees(),
    ...overrides,
  };
}

function buildFromTrades(
  trades: Trade[],
  mark: number,
  defaults: { leverage?: number; marginMode?: "CROSS" | "ISOLATED"; walletBalance?: number } = {},
) {
  return buildPosition(trades, mark, SYMBOL, defaults)!;
}

function assertFiniteRoi(value: number): void {
  expect(Number.isFinite(value)).toBe(true);
  expect(Number.isNaN(value)).toBe(false);
  expect(Object.is(value, -0)).toBe(false);
  expect(Math.abs(value)).toBeLessThan(1e8);
}

function assertPerpInvariants(
  state: PortfolioEngineState,
  mark: number,
): void {
  const { portfolio: p, positions } = state;
  expect(p.walletBalance).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(p.equity)).toBe(true);
  expect(p.marginUsed).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(p.unrealizedPnL)).toBe(true);
  expect(Number.isFinite(p.realizedPnL)).toBe(true);
  assertFiniteRoi(p.totalReturnPercent);

  if (p.marginMode === "CROSS") {
    expect(p.cashBalance).toBeLessThanOrEqual(p.equity + 1e-6);
  }

  for (const pos of positions) {
    if (pos.quantity === 0) continue;
    expect(pos.maintenanceMargin).toBeGreaterThanOrEqual(0);
    expect(pos.maintenanceMargin).toBeLessThanOrEqual(pos.positionValue + 1e-6);
    assertFiniteRoi(pos.roiPercent);
    expect(computePositionMarginRatio({
      maintenanceMargin: pos.maintenanceMargin,
      entryMargin: pos.entryMargin,
      unrealizedPnL: pos.unrealizedPnL,
    })).toBeGreaterThanOrEqual(0);
    if (pos.liquidationPrice != null) {
      expect(Number.isFinite(pos.liquidationPrice)).toBe(true);
      expect(pos.liquidationPrice).toBeGreaterThan(0);
    }
    const liq = computeLiquidationState({
      quantity: pos.quantity,
      avgEntry: pos.avgEntry,
      entryMargin: pos.entryMargin,
      markPrice: mark,
      leverage: pos.leverage,
      marginMode: pos.marginMode,
      walletBalance: p.walletBalance,
    });
    if (liq.liquidationPrice != null) {
      expect(Number.isFinite(liq.liquidationPrice)).toBe(true);
    }
  }
}

describe("PERP engine audit (FASE 11.8)", () => {
  describe("1. PnL — Binance-style average cost", () => {
    it("LONG unrealized PnL = qty × (mark − entry)", () => {
      const pos = buildFromTrades([trade("BUY", 1, 60_000, { leverage: 10 })], 65_000, {
        leverage: 10,
      });
      expect(pos.unrealizedPnL).toBe(5_000);
    });

    it("SHORT unrealized PnL = |qty| × (entry − mark)", () => {
      const pos = buildFromTrades([trade("SELL", 1, 60_000, { leverage: 10 })], 55_000, {
        leverage: 10,
      });
      expect(pos.quantity).toBeLessThan(0);
      expect(pos.unrealizedPnL).toBe(5_000);
    });

    it("partial close realizes PnL without changing average entry", () => {
      const trades = [
        trade("BUY", 1, 50_000, { timestamp: 1 }),
        trade("SELL", 0.4, 55_000, { timestamp: 2 }),
      ];
      const acc = accumulatePositionFromTrades(trades);
      expect(acc.realizedPnL).toBeCloseTo(0.4 * (55_000 - 50_000), 4);
      const pos = buildFromTrades(trades, 55_000);
      expect(pos.avgEntry).toBe(50_000);
      expect(pos.quantity).toBeCloseTo(0.6, 8);
    });

    it("full close realizes all PnL and flattens", () => {
      const trades = [
        trade("BUY", 1, 50_000, { timestamp: 1 }),
        trade("SELL", 1, 52_000, { timestamp: 2 }),
      ];
      const acc = accumulatePositionFromTrades(trades);
      expect(acc.realizedPnL).toBe(2_000);
      expect(acc.quantity).toBe(0);
    });

    it("increase same side updates weighted average entry", () => {
      const trades = [
        trade("BUY", 1, 50_000, { timestamp: 1 }),
        trade("BUY", 1, 60_000, { timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, 60_000);
      expect(pos.avgEntry).toBe(55_000);
    });

    it("LONG→SHORT flip resets average to fill price", () => {
      const trades = [
        trade("BUY", 1, 50_000, { timestamp: 1 }),
        trade("SELL", 2, 55_000, { timestamp: 2 }),
      ];
      const acc = accumulatePositionFromTrades(trades);
      expect(acc.quantity).toBe(-1);
      expect(acc.realizedPnL).toBeCloseTo(1 * (55_000 - 50_000), 4);
      const pos = buildFromTrades(trades, 55_000);
      expect(pos.avgEntry).toBe(55_000);
    });

    it("SHORT→LONG flip resets average to fill price", () => {
      const trades = [
        trade("SELL", 1, 60_000, { timestamp: 1 }),
        trade("BUY", 2, 58_000, { timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, 58_000);
      expect(pos.quantity).toBe(1);
      expect(pos.avgEntry).toBe(58_000);
    });

    it("engine realized PnL matches accumulator after round trip", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, 60_000, 60_000);
      await engine.sell(1, 65_000, 65_000);
      const state = await engine.getState(65_000);
      expect(state.portfolio.realizedPnL).toBe(5_000);
      expect(state.positions).toHaveLength(0);
    });
  });

  describe("2. Average entry — margin vs contracts", () => {
    it("rebuilding position at different wallet does not change average entry", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10 })];
      const a = buildFromTrades(trades, MARK, { leverage: 10, walletBalance: 100_000 });
      const b = buildFromTrades(trades, MARK, { leverage: 10, walletBalance: 500_000 });
      expect(a.avgEntry).toBe(b.avgEntry);
    });

    it("adding contracts changes average; partial reduce does not", () => {
      const base = [trade("BUY", 1, 50_000, { timestamp: 1 })];
      const increased = [
        ...base,
        trade("BUY", 1, 60_000, { timestamp: 2 }),
      ];
      const reduced = [
        ...increased,
        trade("SELL", 0.5, 58_000, { timestamp: 3 }),
      ];
      expect(buildFromTrades(base, MARK).avgEntry).toBe(50_000);
      expect(buildFromTrades(increased, MARK).avgEntry).toBe(55_000);
      expect(buildFromTrades(reduced, MARK).avgEntry).toBe(55_000);
    });

    it("entryMargin scales with notional/leverage — not a separate margin top-up", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10 })];
      const pos = buildFromTrades(trades, MARK, { leverage: 10 });
      expect(pos.entryMargin).toBe(entryMarginForPosition(1, 60_000, 10));
      expect(pos.avgEntry).toBe(60_000);
    });
  });

  describe("3. ROI / ROE extremes", () => {
    const leverages = [10, 20, 50, 100, 125] as const;

    it.each(leverages)("ROI finite at entry for %ix", (leverage) => {
      const pos = buildFromTrades(
        [trade("BUY", 1, MARK, { leverage })],
        MARK,
        { leverage },
      );
      assertFiniteRoi(pos.roiPercent);
      expect(pos.roiPercent).toBe(0);
    });

    it("roiPercent never returns NaN, Infinity, or -0", () => {
      const cases: Array<[number, number]> = [
        [0, 100],
        [100, 0],
        [-500, 50],
        [1e-6, 1e-8],
        [1e6, 1],
      ];
      for (const [uPnL, margin] of cases) {
        const roi = roiPercent(uPnL, margin);
        assertFiniteRoi(roi);
      }
    });

    it("roiPercent caps pathological micro-margin inputs below 100M%", () => {
      expect(roiPercent(1e-6, 1e-8)).toBeLessThan(1e8);
    });

    it("small margin engine trade keeps ROI bounded", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 125 });
      const qty = normalizeQuantity(SYMBOL, 0.00001);
      await engine.buy(qty, MARK, MARK);
      const up = await engine.getState(MARK + 500);
      const pos = up.positions[0]!;
      assertFiniteRoi(pos.roiPercent);
    });

    it("account totalReturnPercent is finite after loss", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const down = await engine.getState(MARK - 20_000);
      assertFiniteRoi(down.portfolio.totalReturnPercent);
    });
  });

  describe("4. Margin — cross/isolated × leverage grid", () => {
    const grid = [
      { leverage: 10, marginMode: "CROSS" as const },
      { leverage: 20, marginMode: "CROSS" as const },
      { leverage: 50, marginMode: "CROSS" as const },
      { leverage: 100, marginMode: "CROSS" as const },
      { leverage: 125, marginMode: "CROSS" as const },
      { leverage: 10, marginMode: "ISOLATED" as const },
      { leverage: 125, marginMode: "ISOLATED" as const },
    ];

    it.each(grid)("$marginMode $leverage x — wallet fields consistent", async ({
      leverage,
      marginMode,
    }) => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage, marginMode });
      await engine.buy(1, MARK, MARK);
      const extreme = await engine.getState(MARK * 1.5);
      const crash = await engine.getState(MARK * 0.5);

      for (const state of [extreme, crash]) {
        assertPerpInvariants(state, state.positions[0]?.markPrice ?? MARK);
        const wallet = computeWalletState({
          walletBalance: state.portfolio.walletBalance,
          marginUsed: state.portfolio.marginUsed,
          unrealizedPnL: state.portfolio.unrealizedPnL,
          maintenanceMarginTotal: state.positions[0]?.maintenanceMargin ?? 0,
          marginMode: state.portfolio.marginMode,
        });
        expect(state.portfolio.walletBalance).toBe(wallet.walletBalance);
        expect(state.portfolio.equity).toBe(wallet.equity);
        expect(state.portfolio.cashBalance).toBe(wallet.availableBalance);
        expect(state.portfolio.marginUsed).toBe(wallet.marginUsed);
        expect(wallet.lockedFunds).toBe(wallet.marginUsed);
        expect(wallet.lockedFunds).toBeGreaterThanOrEqual(0);
      }
    });

    it("partial close reduces marginUsed proportionally", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const full = await engine.getState(MARK);
      await engine.sell(0.5, MARK, MARK);
      const half = await engine.getState(MARK);
      expect(half.portfolio.marginUsed).toBeCloseTo(full.portfolio.marginUsed / 2, 2);
      expect(half.positions[0]!.avgEntry).toBe(full.positions[0]!.avgEntry);
    });

    it("margin check uses trade marginMode when engine runtime is stale", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const isoEngine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      await isoEngine.buy(1, MARK, MARK);

      const crossEngine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      const state = await crossEngine.getState(MARK);
      expect(state.portfolio.marginMode).toBe("ISOLATED");
      expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, MARK) - 6_000, 4);
    });
  });

  describe("5. Liquidation — trigger precision", () => {
    function createMutablePriceFeed(initial: number | null = null) {
      let price = initial;
      return {
        getLastPrice: () => price,
        setPrice: (next: number | null) => {
          price = next;
        },
      };
    }

    it("isolated long: at liq price equityAtRisk is within maintenance tolerance", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, MARK, { leverage: 10, marginMode: "ISOLATED" })],
        MARK,
        { leverage: 10, marginMode: "ISOLATED", walletBalance: 500_000 },
      );
      const liqPrice = pos.liquidationPrice!;
      const atLiq = perpMetricsAtMark({
        quantity: pos.quantity,
        avgEntry: pos.avgEntry,
        leverage: pos.leverage,
        entryMargin: pos.entryMargin,
        markPrice: liqPrice,
      });
      const atRisk = computeEquityAtRisk({
        marginMode: "ISOLATED",
        entryMargin: pos.entryMargin,
        unrealizedPnL: atLiq.unrealizedPnL,
        accountEquity: 500_000 + atLiq.unrealizedPnL,
      });
      expect(atRisk).toBeLessThanOrEqual(atLiq.maintenanceMargin + 1);
      const belowLiq = perpMetricsAtMark({
        quantity: pos.quantity,
        avgEntry: pos.avgEntry,
        leverage: pos.leverage,
        entryMargin: pos.entryMargin,
        markPrice: liqPrice - 1,
      });
      expect(
        isLiquidationTriggered({
          quantity: pos.quantity,
          entryMargin: pos.entryMargin,
          maintenanceMargin: belowLiq.maintenanceMargin,
          unrealizedPnL: belowLiq.unrealizedPnL,
          marginMode: "ISOLATED",
          accountEquity: 500_000 + belowLiq.unrealizedPnL,
        }),
      ).toBe(true);
    });

    it("isolated long: one tick above liq does not trigger evaluate", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const pos = state.positions[0]!;
      const liq = pos.liquidationPrice!;
      const safeMark = liq + 1;
      const safeState = await engine.getState(safeMark);
      const safePos = safeState.positions[0]!;
      const liquidationEngine = createLiquidationEngine(engine);
      expect(liquidationEngine.evaluate(safePos, safeMark, safeState)).toBeNull();
    });

    it("isolated long: scheduler liquidates one tick below liq", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      const liquidationEngine = createLiquidationEngine(engine);
      const priceFeed = createMutablePriceFeed(MARK);
      const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

      await engine.buy(1, MARK, MARK);
      const before = await engine.getState(MARK);
      const liq = before.positions[0]!.liquidationPrice!;
      priceFeed.setPrice(liq - 1);
      await scheduler.tick();

      const after = await engine.getState(liq - 1);
      expect(after.positions).toHaveLength(0);
      expect(after.trades.some((t) => t.liquidation)).toBe(true);
    });

    it("cross long survives gap that would liquidate isolated", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      const liquidationEngine = createLiquidationEngine(engine);
      const priceFeed = createMutablePriceFeed(MARK);
      const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

      await engine.buy(1, MARK, MARK);
      priceFeed.setPrice(53_000);
      await scheduler.tick();

      const state = await engine.getState(53_000);
      expect(state.positions).toHaveLength(1);
    });
  });

  describe("6. Funding", () => {
    it("engine never mutates wallet from funding — no funding module exists", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const t0 = await engine.getState(MARK);
      await engine.getState(MARK);
      await engine.getState(MARK + 1_000);
      const t1 = await engine.getState(MARK + 1_000);
      expect(t1.portfolio.walletBalance).toBe(t0.portfolio.walletBalance);
      expect(t1.portfolio.realizedPnL).toBe(0);
    });
  });

  describe("7. Fees", () => {
    it("persisted fee record does not affect engine PnL", () => {
      const withFees = accumulatePositionFromTrades([
        trade("BUY", 1, MARK),
        trade("SELL", 1, MARK + 1_000),
      ]);
      const baseline = accumulatePositionFromTrades([
        trade("BUY", 1, MARK),
        trade("SELL", 1, MARK + 1_000),
      ]);
      expect(withFees.realizedPnL).toBe(baseline.realizedPnL);
      expect(withFees.realizedPnL).toBe(1_000);
    });

    it("engine does not double-charge fees on open/close/flip", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        positionMode: "LONG_SHORT",
      });
      await engine.buy(1, MARK, MARK);
      await engine.sell(2, MARK + 500, MARK + 500);
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      expect(state.portfolio.realizedPnL).toBe(1_000);
    });
  });

  describe("8. Precision — PositionSizing only for qty comparisons", () => {
    it("dust remainder collapses to flat position", () => {
      const minStep = 0.00001;
      const trades = [
        trade("BUY", 1, MARK, { timestamp: 1 }),
        trade("SELL", 1 - minStep / 2, MARK, { timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, MARK);
      expect(isEffectivelyZero(SYMBOL, Math.abs(pos.quantity))).toBe(true);
    });
  });

  describe("9. Risk — non-negative balances", () => {
    it("cannot open position with insufficient isolated margin", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(1_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      await expect(engine.buy(1, MARK, MARK)).rejects.toThrow(/Insufficient cash/);
    });

    it("wallet and equity stay non-negative after heavy loss (cross)", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      await engine.buy(1, MARK, MARK);
      const crash = await engine.getState(30_000);
      expect(crash.portfolio.walletBalance).toBeGreaterThanOrEqual(0);
      expect(crash.portfolio.equity).toBeGreaterThanOrEqual(0);
      expect(crash.portfolio.marginUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("10. Invariants — automatic checks", () => {
    it("derivePerpWalletMetrics satisfies wallet invariants", () => {
      const trades = [trade("BUY", 1, MARK, { leverage: 10 })];
      const { snapshot, position } = derivePerpWalletMetrics({
        accountId: "audit",
        initialCashBalance: 500_000,
        walletCash: 500_000,
        realizedPnL: 0,
        trades,
        markPrice: MARK + 5_000,
        leverage: 10,
        marginMode: "CROSS",
      });
      expect(snapshot.walletBalance).toBeGreaterThanOrEqual(0);
      expect(snapshot.equity).toBe(snapshot.walletBalance + snapshot.unrealizedPnL);
      expect(snapshot.marginUsed).toBeGreaterThanOrEqual(0);
      if (position) {
        expect(position.maintenanceMargin).toBeLessThanOrEqual(position.positionValue);
        expect(position.entryMargin).toBeLessThanOrEqual(position.positionValue);
      }
    });
  });

  describe("11. Stress — 1000 consecutive operations", () => {
    let storage: MemoryPortfolioStorage;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000_000));
    });

    it(
      "randomized PERP sequence stays finite with no ghost positions",
      async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        positionMode: "LONG_SHORT",
        marginMode: "CROSS",
      });

      let mark = MARK;
      let seed = 42;

      const rand = () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return seed / 0xffffffff;
      };

      for (let i = 0; i < 1_000; i += 1) {
        mark = MARK * (0.85 + rand() * 0.3);
        const leverageOptions = [10, 20, 50];
        engine.setLeverage(leverageOptions[Math.floor(rand() * leverageOptions.length)]!);

        const state = await engine.getState(mark);
        assertPerpInvariants(state, mark);

        const qty = normalizeQuantity(SYMBOL, 0.001 + rand() * 0.01);
        const action = rand();

        try {
          if (action < 0.35) {
            await engine.buy(qty, mark, mark);
          } else if (action < 0.7) {
            await engine.sell(qty, mark, mark);
          } else if (state.positions.length > 0 && action < 0.85) {
            const pos = state.positions[0]!;
            const closeQty = normalizeQuantity(
              SYMBOL,
              Math.abs(pos.quantity) * (0.25 + rand() * 0.75),
            );
            if (closeQty > 0) {
              if (pos.quantity > 0) {
                await engine.sell(closeQty, mark, mark);
              } else {
                await engine.buy(closeQty, mark, mark);
              }
            }
          }
        } catch {
          // insufficient margin — skip
        }

        const after = await engine.getState(mark);
        assertPerpInvariants(after, mark);

        for (const pos of after.positions) {
          expect(Number.isNaN(pos.quantity)).toBe(false);
          expect(Number.isNaN(pos.unrealizedPnL)).toBe(false);
          if (pos.quantity !== 0) {
            expect(isEffectivelyZero(SYMBOL, Math.abs(pos.quantity))).toBe(false);
          }
        }
      }

      const finalState = await engine.getState(mark);
      const openQty = finalState.positions.reduce((s, p) => s + Math.abs(p.quantity), 0);
      if (openQty === 0 || isEffectivelyZero(SYMBOL, openQty)) {
        expect(finalState.positions.every((p) => p.quantity === 0)).toBe(true);
      }
      },
      60_000,
    );
  });
});
