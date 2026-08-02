import { describe, expect, it } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import {
  computeFuturesLiquidationPrice,
  entryMarginForPosition,
  marginRatioAtEntry,
  perpMetricsAtMark,
  roiPercent,
} from "@/lib/portfolio/futures/futuresAccounting";
import { computeLiquidationState, computePositionMarginRatio } from "@/lib/portfolio/futures/MarginModel";
import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import {
  accumulatePositionFromTrades,
  buildPosition,
} from "@/lib/portfolio/positionEngine";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import type { Trade } from "@/lib/portfolio/types";
import { computeLivePositionMetrics, perpPositionToCardView } from "@/components/portfolio/positionCardModel";

const SYMBOL = PORTFOLIO_V1_SYMBOL;

function trade(
  side: Trade["side"],
  quantity: number,
  price: number,
  overrides: Partial<Trade> = {},
): Trade {
  return {
    id: `t-${side}-${quantity}-${price}`,
    symbol: SYMBOL,
    side,
    quantity,
    price,
    timestamp: Date.now(),
    source: "PAPER",
    fees: createZeroTradeFees(),
    ...overrides,
  };
}

function buildFromTrades(
  trades: Trade[],
  mark: number,
  defaults: { leverage?: number; marginMode?: "CROSS" | "ISOLATED" } = {},
) {
  return buildPosition(trades, mark, SYMBOL, defaults)!;
}

describe("PERP financial model audit", () => {
  describe("1. Margin mode (CROSS vs ISOLATED)", () => {
    it("Cross available balance includes unrealized PnL", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      await engine.buy(1, 60_000, 60_000);
      const up = await engine.getState(70_000);
      expect(up.portfolio.marginMode).toBe("CROSS");
      // margin 6k, uPnL +10k, opening fee
      expect(up.portfolio.cashBalance).toBeCloseTo(
        500_000 - openFee(1, 60_000) - 6_000 + 10_000,
        4,
      );
    });

    it("Isolated available balance excludes unrealized PnL", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      await engine.buy(1, 60_000, 60_000);
      const up = await engine.getState(70_000);
      expect(up.portfolio.marginMode).toBe("ISOLATED");
      // margin 6k → wallet − margin (isolated excludes uPnL from available)
      expect(up.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 6_000, 4);
    });

    it("deriveEngineState resolves marginMode from trades when engine runtime is stale", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      await engine.buy(1, 60_000, 60_000);

      const crossDefault = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      const state = await crossDefault.getState(70_000);
      expect(state.portfolio.marginMode).toBe("ISOLATED");
      expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 6_000, 4);
    });

    it("entry margin and position value are identical across margin modes", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10, marginMode: "CROSS" })];
      const cross = buildFromTrades(trades, 60_000, { marginMode: "CROSS" });
      const isolated = buildFromTrades(trades, 60_000, { marginMode: "ISOLATED" });
      expect(cross.entryMargin).toBe(isolated.entryMargin);
      expect(cross.positionValue).toBe(isolated.positionValue);
    });
  });

  describe("2. Margin ratio", () => {
    it("at entry equals maintenanceRate × leverage (125x → 62.5%)", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 125 })],
        60_000,
        { leverage: 125 },
      );
      expect(marginRatioAtEntry(125)).toBeCloseTo(62.5, 4);
      expect(pos.marginRatio).toBeCloseTo(62.5, 1);
    });

    it("decreases when profitable long mark rises", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10 })];
      const atEntry = buildFromTrades(trades, 60_000, { leverage: 10 });
      const up = buildFromTrades(trades, 70_000, { leverage: 10 });
      expect(up.marginRatio).toBeLessThan(atEntry.marginRatio);
    });

    it("increases when losing long mark falls", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10 })];
      const atEntry = buildFromTrades(trades, 60_000, { leverage: 10 });
      const down = buildFromTrades(trades, 50_000, { leverage: 10 });
      expect(down.marginRatio).toBeGreaterThan(atEntry.marginRatio);
    });

    it("perpMetricsAtMark matches buildPosition margin ratio at same mark", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 20 })],
        65_000,
        { leverage: 20 },
      );
      const live = perpMetricsAtMark({
        quantity: pos.quantity,
        avgEntry: pos.avgEntry,
        leverage: pos.leverage,
        entryMargin: pos.entryMargin,
        markPrice: 65_000,
      });
      expect(
        computePositionMarginRatio({
          maintenanceMargin: live.maintenanceMargin,
          entryMargin: pos.entryMargin,
          unrealizedPnL: live.unrealizedPnL,
        }),
      ).toBe(pos.marginRatio);
    });

    it("live tick margin ratio diverges from entry when mark moves", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 125 })],
        60_000,
        { leverage: 125 },
      );
      const view = perpPositionToCardView(pos);
      const atEntry = computeLivePositionMetrics(view, 60_000);
      const up = computeLivePositionMetrics(view, 70_000);
      expect(atEntry.positionMarginRatio).toBeCloseTo(62.5, 1);
      expect(up.positionMarginRatio!).toBeLessThan(atEntry.positionMarginRatio!);
    });
  });

  describe("3. Liquidation price", () => {
    it("long isolated liq price from MarginModel equity breach", () => {
      const price = computeFuturesLiquidationPrice(1, 60_000, 10);
      const entryMargin = 60_000 / 10;
      const expected = (entryMargin - 60_000) / (1 * (0.005 - 1));
      expect(price).toBeCloseTo(expected, 2);
    });

    it("short isolated liq price from MarginModel equity breach", () => {
      const price = computeFuturesLiquidationPrice(-1, 60_000, 10);
      const entryMargin = 60_000 / 10;
      const expected = (entryMargin + 60_000) / (1 * (1 + 0.005));
      expect(price).toBeCloseTo(expected, 2);
    });

    it("liq price is static from entry — does not move with mark", () => {
      const trades = [trade("BUY", 1, 60_000, { leverage: 10 })];
      const at50k = buildFromTrades(trades, 50_000, { leverage: 10 });
      const at70k = buildFromTrades(trades, 70_000, { leverage: 10 });
      expect(at50k.liquidationPrice).toBe(at70k.liquidationPrice);
    });

    it("higher leverage moves long liq price closer to entry", () => {
      const lowLev = computeFuturesLiquidationPrice(1, 60_000, 5);
      const highLev = computeFuturesLiquidationPrice(1, 60_000, 20);
      expect(highLev!).toBeGreaterThan(lowLev!);
    });
  });

  describe("4. Position value", () => {
    it("open position value is |quantity| × markPrice", () => {
      const pos = buildFromTrades([trade("BUY", 0.5, 60_000)], 65_000);
      expect(pos.positionValue).toBe(0.5 * 65_000);
    });

    it("never equals margin × leverage after mark diverges from entry", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 10 })],
        70_000,
        { leverage: 10 },
      );
      expect(pos.positionValue).toBe(70_000);
      expect(pos.entryMargin * pos.leverage).toBe(60_000);
      expect(pos.positionValue).not.toBe(pos.entryMargin * pos.leverage);
    });
  });

  describe("5. ROI", () => {
    it("denominator is entryMargin, not position value or wallet", () => {
      const pos = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 10 })],
        66_000,
        { leverage: 10 },
      );
      expect(pos.entryMargin).toBe(6_000);
      expect(pos.unrealizedPnL).toBe(6_000);
      expect(pos.roiPercent).toBeCloseTo(100, 2);
      expect(pos.roiPercent).not.toBeCloseTo(
        (pos.unrealizedPnL / pos.positionValue) * 100,
        0,
      );
    });

    it("roiPercent helper never returns NaN or Infinity", () => {
      expect(roiPercent(1000, 0)).toBe(0);
      expect(roiPercent(0, 100)).toBe(0);
      expect(Number.isFinite(roiPercent(1e6, 1))).toBe(true);
    });

    it("live ROI matches engine after mark tick", () => {
      const pos = buildFromTrades(
        [trade("SELL", 1, 60_000, { leverage: 5 })],
        55_000,
        { leverage: 5 },
      );
      const view = perpPositionToCardView(pos);
      const live = computeLivePositionMetrics(view, 55_000);
      expect(live.pnlPercent).toBeCloseTo(pos.roiPercent, 1);
    });
  });

  describe("6. Hedging (net exposure only)", () => {
    it("LONG then partial SHORT reduces net quantity — ROI stays finite", () => {
      const trades = [
        trade("BUY", 1, 50_000, { leverage: 10, timestamp: 1 }),
        trade("SELL", 0.5, 55_000, { leverage: 10, timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, 55_000, { leverage: 10 });
      expect(pos.quantity).toBeCloseTo(0.5, 8);
      expect(Number.isFinite(pos.roiPercent)).toBe(true);
      expect(pos.roiPercent).toBeCloseTo(100, 0);
    });

    it("hedge 50/50 nets to zero — no open position metrics", () => {
      const trades = [
        trade("BUY", 1, 50_000, { timestamp: 1 }),
        trade("SELL", 1, 52_000, { timestamp: 2 }),
      ];
      const acc = accumulatePositionFromTrades(trades);
      expect(acc.quantity).toBe(0);
      const pos = buildFromTrades(trades, 52_000);
      expect(pos.quantity).toBe(0);
      expect(pos.roiPercent).toBe(0);
    });

    it("SHORT exceeds LONG — flips to net short with correct sign", () => {
      const trades = [
        trade("BUY", 1, 50_000, { leverage: 10, timestamp: 1 }),
        trade("SELL", 2, 55_000, { leverage: 10, timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, 55_000, { leverage: 10 });
      expect(pos.quantity).toBeCloseTo(-1, 8);
      expect(pos.avgEntry).toBe(55_000);
      expect(pos.unrealizedPnL).toBeCloseTo(0, 8);
      expect(pos.roiPercent).toBe(0);
      expect(Number.isFinite(pos.roiPercent)).toBe(true);

      const losing = buildFromTrades(trades, 60_000, { leverage: 10 });
      expect(losing.unrealizedPnL).toBeLessThan(0);
      expect(losing.roiPercent).toBeLessThan(0);
    });

    it("LONG exceeds SHORT after flip back — ROI sign matches PnL", () => {
      const trades = [
        trade("BUY", 1, 50_000, { leverage: 10, timestamp: 1 }),
        trade("SELL", 2, 55_000, { leverage: 10, timestamp: 2 }),
        trade("BUY", 1.5, 54_000, { leverage: 10, timestamp: 3 }),
      ];
      const pos = buildFromTrades(trades, 56_000, { leverage: 10 });
      expect(pos.quantity).toBeGreaterThan(0);
      expect(Math.sign(pos.roiPercent)).toBe(Math.sign(pos.unrealizedPnL));
      expect(Number.isFinite(pos.roiPercent)).toBe(true);
    });

    it("live metrics preserve ROI sign after hedge flip", () => {
      const trades = [
        trade("BUY", 1, 50_000, { leverage: 10, timestamp: 1 }),
        trade("SELL", 2, 55_000, { leverage: 10, timestamp: 2 }),
      ];
      const pos = buildFromTrades(trades, 58_000, { leverage: 10 });
      const view = perpPositionToCardView(pos);
      const live = computeLivePositionMetrics(view, 58_000);
      expect(Math.sign(live.pnlPercent)).toBe(Math.sign(live.unrealizedPnL));
      expect(Number.isFinite(live.pnlPercent)).toBe(true);
    });
  });

  describe("7. Leverage and margin changes", () => {
    it("higher leverage increases entry margin ratio at entry", () => {
      const low = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 5 })],
        60_000,
        { leverage: 5 },
      );
      const high = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 50 })],
        60_000,
        { leverage: 50 },
      );
      expect(high.marginRatio).toBeGreaterThan(low.marginRatio);
      expect(high.entryMargin).toBeLessThan(low.entryMargin);
    });

    it("add-to-position increases entryMargin proportionally", () => {
      const single = buildFromTrades(
        [trade("BUY", 1, 60_000, { leverage: 10 })],
        60_000,
        { leverage: 10 },
      );
      const doubled = buildFromTrades(
        [
          trade("BUY", 1, 60_000, { leverage: 10, timestamp: 1 }),
          trade("BUY", 1, 62_000, { leverage: 10, timestamp: 2 }),
        ],
        62_000,
        { leverage: 10 },
      );
      expect(doubled.entryMargin).toBeGreaterThan(single.entryMargin);
      expect(entryMarginForPosition(doubled.quantity, doubled.avgEntry, 10)).toBe(
        doubled.entryMargin,
      );
    });
  });
});
