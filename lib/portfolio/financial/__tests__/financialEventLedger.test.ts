import { describe, expect, it, beforeEach } from "vitest";

import { validateLedgerEntry } from "@/lib/cartera/ledger/LedgerEntrySchema";
import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { BINANCE_USDT_FUTURES_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";
import { openFee, ZERO_FUNDING_SNAPSHOT, ZERO_INSURANCE_FUND_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_OPEN_ORDERS_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
import { buildFinancialHistoryFromLedger } from "@/lib/portfolio/financial/buildFinancialHistoryFromLedger";
import {
  FinancialEventLedger,
  hydrateFinancialEvents,
} from "@/lib/portfolio/financial/FinancialEventLedger";
import { createTradeFeeEvent } from "@/lib/portfolio/financial/tradeFeeToEvent";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { createTrade } from "@/lib/portfolio/tradeEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

const MARK = 60_000;
const TAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.takerRate;

describe("FinancialEventLedger (FASE 12.1)", () => {
  describe("TRADE_FEE events", () => {
    it("createTradeFeeEvent produces negative signed amount", () => {
      const trade = createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 1,
        price: MARK,
        source: "PAPER",
      });
      const enriched = {
        ...trade,
        fees: {
          ...trade.fees,
          openingFee: MARK * TAKER,
          totalFee: MARK * TAKER,
          breakdown: {
            ...trade.fees.breakdown,
            openingFee: MARK * TAKER,
            takerFee: MARK * TAKER,
            totalFee: MARK * TAKER,
          },
        },
      };
      const event = createTradeFeeEvent(enriched)!;
      expect(event.type).toBe("TRADE_FEE");
      expect(event.amount).toBeCloseTo(-MARK * TAKER, 4);
      expect(event.tradeId).toBe(trade.id);
      expect(event.openingFee).toBeCloseTo(MARK * TAKER, 4);
    });
  });

  describe("hydration legacy", () => {
    it("synthesizes TRADE_FEE from trades when no events persisted", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const persisted = await storage.load();
      expect(persisted.financialEvents?.length).toBe(1);

      const hydrated = hydrateFinancialEvents([], persisted.trades);
      expect(hydrated).toHaveLength(1);
      expect(hydrated[0]!.type).toBe("TRADE_FEE");
      expect(hydrated[0]!.amount).toBeCloseTo(-openFee(1, MARK), 4);
    });

    it("does not duplicate when events already exist", () => {
      const trade = createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 1,
        price: MARK,
        source: "PAPER",
      });
      const event = createTradeFeeEvent({
        ...trade,
        fees: { ...trade.fees, totalFee: 30, openingFee: 30 },
      })!;
      const hydrated = hydrateFinancialEvents([event], [trade]);
      expect(hydrated).toHaveLength(1);
    });
  });

  describe("aggregation", () => {
    it("aggregates multiple event types", () => {
      const ledger = FinancialEventLedger.fromPersisted([]);
      ledger.appendEvent({
        id: "fee_1",
        timestamp: Date.now(),
        type: "TRADE_FEE",
        amount: -30,
        currency: "USDT",
        tradeId: "t1",
        description: "Trade fee",
        version: "binance-usdt-v1",
        openingFee: 30,
      });
      ledger.appendEvent({
        id: "rebate_1",
        timestamp: Date.now(),
        type: "MAKER_REBATE",
        amount: 5,
        currency: "USDT",
        description: "Maker rebate",
        version: "financial-event-v1",
      });
      ledger.appendEvent({
        id: "fund_1",
        timestamp: Date.now(),
        type: "FUNDING",
        amount: -2,
        currency: "USDT",
        description: "Funding",
        version: "financial-event-v1",
      });

      const agg = ledger.aggregate();
      expect(agg.feesPaid).toBe(30);
      expect(agg.rebates).toBe(5);
      expect(agg.fundingPaid).toBe(-2);
      expect(agg.netEffect).toBeCloseTo(-27, 4);
    });
  });

  describe("wallet", () => {
    it("resolveWalletBalance uses events not trade.fees directly", () => {
      const trade = createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 1,
        price: MARK,
        source: "PAPER",
      });
      const feeTrade = {
        ...trade,
        fees: { ...trade.fees, totalFee: 30, openingFee: 30 },
      };
      const event = createTradeFeeEvent(feeTrade)!;

      const withEvents = resolveWalletBalance(500_000, [feeTrade], [event]);
      const hydrated = resolveWalletBalance(500_000, [feeTrade], []);
      expect(withEvents).toBeCloseTo(499_970, 4);
      expect(hydrated).toBeCloseTo(499_970, 4);
    });
  });

  describe("persistence", () => {
    let storage: MemoryPortfolioStorage;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    });

    it("persists TRADE_FEE on trade commit", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const persisted = await storage.load();
      expect(persisted.financialEvents).toHaveLength(1);
      expect(persisted.financialEvents![0]!.type).toBe("TRADE_FEE");
      expect(persisted.financialEvents![0]!.tradeId).toBe(persisted.trades[0]!.id);
    });

    it("reload preserves events without drift", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const before = await storage.load();
      const reloaded = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      const state = await reloaded.getState(MARK);
      expect(state.financialEvents).toHaveLength(before.financialEvents!.length);
      expect(state.financialEvents[0]!.amount).toBe(before.financialEvents![0]!.amount);
    });
  });

  describe("snapshot", () => {
    it("derivePerpWalletMetrics exposes financial event buckets", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const persisted = await storage.load();
      const { snapshot } = derivePerpWalletMetrics({
        accountId: "acc",
        initialCashBalance: 500_000,
        walletCash: persisted.walletCash,
        realizedPnL: 0,
        trades: persisted.trades,
        financialEvents: persisted.financialEvents,
        markPrice: MARK,
      });

      expect(snapshot.financialEvents.length).toBeGreaterThan(0);
      expect(snapshot.feesPaid).toBeCloseTo(openFee(1, MARK), 4);
      expect(snapshot.fundingPaid).toBe(0);
      expect(snapshot.rebates).toBe(0);
    });

    it("portfolio snapshot maps financial fields on PERP", () => {
      const snapshot = buildPortfolioAccountSnapshot({
        accountId: "acc",
        markPrice: MARK,
        spotWallet: {
          accountId: "acc",
          usdtFree: 0,
          usdtLocked: 0,
          usdtTotal: 0,
          balances: [],
        },
        spotPositions: [],
        perpWallet: {
          accountId: "acc",
          initialCashBalance: 500_000,
          walletCash: 500_000,
          walletBalance: 499_970,
          availableBalance: 493_970,
          equity: 499_970,
          marginUsed: 6_000,
          realizedPnL: 0,
          unrealizedPnL: 0,
          feesPaid: 30,
          feesToday: 30,
          openingFees: 30,
          closingFees: 0,
          fundingFees: 0,
          totalFees: 30,
          estimatedOpeningFee: 0,
          estimatedClosingFee: 0,
          financialEvents: [
            {
              id: "fee_t1",
              timestamp: Date.now(),
              type: "TRADE_FEE",
              amount: -30,
              currency: "USDT",
              tradeId: "t1",
              description: "Trade fee",
              version: "binance-usdt-v1",
            },
          ],
          fundingPaid: 0,
          rebates: 0,
          insurance: 0,
          adl: 0,
          manualAdjustments: 0,
          ...ZERO_FUNDING_SNAPSHOT,
          ...ZERO_REDUCE_ONLY_SNAPSHOT,
          ...ZERO_POST_ONLY_SNAPSHOT,
          ...ZERO_MAKER_TAKER_SNAPSHOT,
          ...ZERO_OPEN_ORDERS_SNAPSHOT,
          ...ZERO_INSURANCE_FUND_SNAPSHOT,
        },
        perpPositions: [],
      });
      expect(snapshot.perp?.financialEvents).toHaveLength(1);
      expect(snapshot.perp?.feesPaid).toBe(30);
    });
  });

  describe("history", () => {
    it("buildFinancialHistoryFromLedger returns independent rows", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const persisted = await storage.load();
      const rows = buildFinancialHistoryFromLedger(
        persisted.financialEvents ?? [],
        persisted.trades,
      );
      expect(rows[0]!.type).toBe("TRADE_FEE");
      expect(rows[0]!.amount).toBeLessThan(0);
    });
  });

  describe("financial regression", () => {
    it("wallet balance identical to FASE 12.0 after round trip", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      await engine.sell(1, MARK + 10_000, MARK + 10_000);
      const state = await engine.getState(MARK + 10_000);

      expect(state.portfolio.realizedPnL).toBe(10_000);
      expect(state.portfolio.walletBalance).toBeCloseTo(
        500_000 + 10_000 - openFee(1, MARK) - openFee(1, MARK + 10_000),
        2,
      );
      expect(state.positions).toHaveLength(0);
    });

    it("position metrics unchanged — fees only affect wallet", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK + 5_000);
      const pos = state.positions[0]!;

      expect(pos.entryMargin).toBeCloseTo(MARK / 10, 4);
      expect(pos.roiPercent).toBeGreaterThan(0);
      expect(pos.avgEntry).toBe(MARK);
    });
  });

  describe("ledger transaction", () => {
    it("appendFinancialEvent supports future event types", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const tx = await beginLedgerTransaction(storage);
      tx.appendFinancialEvent({
        id: "manual_1",
        timestamp: Date.now(),
        type: "MANUAL_ADJUSTMENT",
        amount: 100,
        currency: "USDT",
        description: "Bonus credit",
        version: "financial-event-v1",
      });
      await tx.commit();
      const persisted = await storage.load();
      expect(persisted.financialEvents).toHaveLength(1);
      expect(persisted.financialEvents![0]!.type).toBe("MANUAL_ADJUSTMENT");
    });
  });
});
