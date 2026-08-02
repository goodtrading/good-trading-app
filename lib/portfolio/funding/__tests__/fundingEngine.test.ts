import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { buildFinancialHistoryFromLedger } from "@/lib/portfolio/financial/buildFinancialHistoryFromLedger";
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import {
  computeFundingPayment,
  computeFundingRate,
  fundingIntervalMs,
  isFundingDue,
  nextFundingTimestamp,
  scheduleFunding,
  settleFunding,
} from "@/lib/portfolio/funding/FundingEngine";
import {
  BINANCE_USDT_FUNDING_SCHEDULE,
  DEFAULT_FUNDING_SCHEDULE,
} from "@/lib/portfolio/funding/FundingSchedule";
import {
  createFundingScheduler,
  type FundingClock,
} from "@/lib/portfolio/funding/FundingScheduler";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

const MARK = 60_000;
const RATE = BINANCE_USDT_FUNDING_SCHEDULE.defaultFundingRate;
const INTERVAL = fundingIntervalMs();

class TestClock implements FundingClock {
  constructor(private ms: number) {}
  now(): number {
    return this.ms;
  }
  advance(by: number): void {
    this.ms += by;
  }
  set(ms: number): void {
    this.ms = ms;
  }
}

describe("FundingEngine (FASE 12.2)", () => {
  it("computeFundingRate reads schedule default", () => {
    expect(computeFundingRate()).toBe(0.0001);
    expect(computeFundingRate().toFixed(4)).toBe("0.0001");
  });

  it("positive funding: LONG pays, SHORT receives", () => {
    const longPay = computeFundingPayment({ quantity: 1, markPrice: MARK, fundingRate: RATE });
    const shortRecv = computeFundingPayment({ quantity: -1, markPrice: MARK, fundingRate: RATE });
    expect(longPay).toBeCloseTo(-MARK * RATE, 4);
    expect(shortRecv).toBeCloseTo(MARK * RATE, 4);
    expect(longPay).toBe(-shortRecv);
  });

  it("negative funding: SHORT pays, LONG receives", () => {
    const negRate = -RATE;
    const longRecv = computeFundingPayment({ quantity: 1, markPrice: MARK, fundingRate: negRate });
    const shortPay = computeFundingPayment({ quantity: -1, markPrice: MARK, fundingRate: negRate });
    expect(longRecv).toBeCloseTo(MARK * RATE, 4);
    expect(shortPay).toBeCloseTo(-MARK * RATE, 4);
    expect(longRecv).toBe(-shortPay);
  });

  it("payment uses notional never margin", () => {
    const payment = computeFundingPayment({ quantity: 1, markPrice: MARK, fundingRate: RATE });
    expect(payment).toBeCloseTo(-(MARK * RATE), 4);
    expect(payment).not.toBeCloseTo(-(MARK / 10 * RATE), 4);
  });

  it("scheduleFunding exposes next timestamp and due flag", () => {
    const now = INTERVAL;
    const info = scheduleFunding({ lastFundingTime: null, now });
    expect(info.nextFundingTime).toBe(INTERVAL);
    expect(info.isDue).toBe(true);

    const after = scheduleFunding({ lastFundingTime: INTERVAL, now: INTERVAL + 1 });
    expect(after.isDue).toBe(false);
    expect(after.nextFundingTime).toBe(INTERVAL * 2);
  });

  describe("integration", () => {
    let storage: MemoryPortfolioStorage;
    let clock: TestClock;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      clock = new TestClock(INTERVAL);
    });

    it("persists FUNDING as FinancialEvent without trades", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const beforeTrades = (await storage.load()).trades.length;

      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });

      expect(await scheduler.isFundingDue()).toBe(true);
      expect(await scheduler.runFunding()).toBe(true);

      const persisted = await storage.load();
      expect(persisted.trades).toHaveLength(beforeTrades);
      expect(persisted.financialEvents?.some((e) => e.type === "FUNDING")).toBe(true);
    });

    it("multiple funding cycles accumulate wallet effect", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);

      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });

      await scheduler.runFunding();
      const afterOne = await engine.getState(MARK);
      const payment = MARK * RATE;

      clock.advance(INTERVAL);
      await scheduler.runFunding();
      const afterTwo = await engine.getState(MARK);

      expect(afterOne.portfolio.walletBalance).toBeCloseTo(
        500_000 - openFee(1, MARK) - payment,
        2,
      );
      expect(afterTwo.portfolio.walletBalance).toBeCloseTo(
        500_000 - openFee(1, MARK) - payment * 2,
        2,
      );
    });

    it("wallet and snapshot expose funding metrics", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);

      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });
      await scheduler.runFunding();

      const persisted = await storage.load();
      const { snapshot } = derivePerpWalletMetrics({
        accountId: "acc",
        initialCashBalance: 500_000,
        walletCash: persisted.walletCash,
        realizedPnL: 0,
        trades: persisted.trades,
        financialEvents: persisted.financialEvents,
        markPrice: MARK,
        asOfTimestamp: clock.now(),
      });

      expect(snapshot.fundingPaid).toBeCloseTo(-MARK * RATE, 4);
      expect(snapshot.fundingEvents).toHaveLength(1);
      expect(snapshot.lastFundingTime).toBe(clock.now());
      expect(snapshot.nextFundingTime).toBe(clock.now() + INTERVAL);
      expect(snapshot.pendingFunding).toBeCloseTo(-MARK * RATE, 4);
      expect(snapshot.fundingRate).toBe(RATE);
    });

    it("financial history lists funding independently", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });
      await scheduler.runFunding();

      const persisted = await storage.load();
      const rows = buildFinancialHistoryFromLedger(
        persisted.financialEvents ?? [],
        persisted.trades,
      );
      expect(rows.some((r) => r.type === "FUNDING")).toBe(true);
      expect(rows.filter((r) => r.type === "TRADE_FEE").length).toBeGreaterThan(0);
    });

    it("scheduler tick catches up multiple due cycles", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        positionMode: "LONG_SHORT",
      });
      await engine.sell(1, MARK, MARK);

      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });

      clock.set(INTERVAL * 3);
      const settled = await scheduler.tick();
      expect(settled).toBe(1);

      clock.advance(INTERVAL);
      const settled2 = await scheduler.tick();
      expect(settled2).toBe(1);
    });

    it("compatibility: no funding events means fundingPaid = 0", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const { snapshot } = derivePerpWalletMetrics({
        accountId: "acc",
        initialCashBalance: 500_000,
        walletCash: state.walletCash,
        realizedPnL: 0,
        trades: state.trades,
        financialEvents: [],
        markPrice: MARK,
      });
      expect(snapshot.fundingPaid).toBe(0);
      expect(snapshot.fundingEvents).toHaveLength(0);
    });

    it("position metrics unchanged after funding settlement", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const before = await engine.getState(MARK);
      const posBefore = before.positions[0]!;

      const scheduler = createFundingScheduler(engine, storage, {
        getLastPrice: () => MARK,
      }, { clock });
      await scheduler.runFunding();

      const after = await engine.getState(MARK);
      const posAfter = after.positions[0]!;

      expect(after.portfolio.realizedPnL).toBe(before.portfolio.realizedPnL);
      expect(posAfter.avgEntry).toBe(posBefore.avgEntry);
      expect(posAfter.quantity).toBe(posBefore.quantity);
      expect(posAfter.entryMargin).toBe(posBefore.entryMargin);
      expect(posAfter.positionValue).toBe(posBefore.positionValue);
      expect(posAfter.roiPercent).toBe(posBefore.roiPercent);
      expect(posAfter.marginRatio).toBe(posBefore.marginRatio);
      expect(posAfter.unrealizedPnL).toBe(posBefore.unrealizedPnL);
      expect(after.portfolio.walletBalance).toBeLessThan(before.portfolio.walletBalance);
    });
  });

  describe("pure engine helpers", () => {
    it("settleFunding builds FUNDING event with signed amount", () => {
      const event = settleFunding({
        quantity: 1,
        markPrice: MARK,
        fundingRate: RATE,
        symbol: "BTCUSDT",
        timestamp: INTERVAL,
      })!;
      expect(event.type).toBe("FUNDING");
      expect(event.amount).toBeCloseTo(-6, 4);
      expect(event.tradeId).toBeUndefined();
    });

    it("isFundingDue and nextFundingTimestamp are clock-injectable", () => {
      expect(isFundingDue(null, INTERVAL - 1)).toBe(false);
      expect(isFundingDue(null, INTERVAL)).toBe(true);
      expect(nextFundingTimestamp(null, 0)).toBe(0);
      expect(isFundingDue(null, 0)).toBe(true);
      expect(nextFundingTimestamp(INTERVAL, INTERVAL + 1)).toBe(INTERVAL * 2);
    });
  });
});
