import { describe, expect, it, beforeEach } from "vitest";

import { validateLedgerEntry } from "@/lib/cartera/ledger/LedgerEntrySchema";
import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { BINANCE_USDT_FUTURES_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";
import { ZERO_FUNDING_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { aggregateTradeFees } from "@/lib/portfolio/fees/aggregateTradeFees";
import {
  computeExecutionFees,
  createZeroTradeFees,
  FEE_MODEL_VERSION,
} from "@/lib/portfolio/fees/FeeModel";
import { hydrateTradeFees } from "@/lib/portfolio/fees/hydrateTradeFees";
import { buildPerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { createTrade } from "@/lib/portfolio/tradeEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

const MARK = 60_000;
const TAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.takerRate;

const ZERO_FEE_WALLET = {
  feesPaid: 0,
  feesToday: 0,
  openingFees: 0,
  closingFees: 0,
  fundingFees: 0,
  totalFees: 0,
  estimatedOpeningFee: 0,
  estimatedClosingFee: 0,
  financialEvents: [],
  fundingPaid: 0,
  rebates: 0,
  insurance: 0,
  adl: 0,
  manualAdjustments: 0,
  ...ZERO_FUNDING_SNAPSHOT,
  ...ZERO_REDUCE_ONLY_SNAPSHOT,
  ...ZERO_POST_ONLY_SNAPSHOT,
  ...ZERO_MAKER_TAKER_SNAPSHOT,
};

describe("Fee pipeline (FASE 11.9 transport)", () => {
  describe("FeeModel transport", () => {
    it("returns full breakdown on market open", () => {
      const execution = computeExecutionFees({
        side: "BUY",
        quantity: 1,
        price: MARK,
        quantityBefore: 0,
        quantityAfter: 1,
        executionLiquidity: "TAKER",
      });
      expect(execution.breakdown.totalFee).toBeCloseTo(MARK * TAKER, 4);
      expect(execution.breakdown.feeModelVersion).toBe(FEE_MODEL_VERSION);
    });

    it("createTrade includes fee record structure", () => {
      const trade = createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 1,
        price: MARK,
        source: "PAPER",
      });
      expect(trade.fees.breakdown).toBeDefined();
      expect(trade.fees.feeCurrency).toBe("USDT");
    });
  });

  describe("Ledger persistence", () => {
    let storage: MemoryPortfolioStorage;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    });

    it("persists full fee breakdown on execute", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const trade = (await storage.load()).trades[0]!;
      expect(trade.fees.totalFee).toBeCloseTo(MARK * TAKER, 4);
      expect(trade.fees.feeModelVersion).toBe(FEE_MODEL_VERSION);
    });

    it("hydrates legacy trades without fee record to zero", () => {
      const legacy = {
        id: "legacy_1",
        symbol: "BTCUSDT",
        side: "BUY" as const,
        quantity: 1,
        price: MARK,
        timestamp: Date.now(),
        source: "PAPER" as const,
      };
      const hydrated = validateLedgerEntry(legacy) as import("@/lib/portfolio/types").Trade;
      expect(hydrated.fees.totalFee).toBe(0);
      expect(hydrated.fees.feeModelVersion).toBe("zero-v1");
    });

    it("serializes and reloads through ledger transaction", async () => {
      const tx = await beginLedgerTransaction(storage);
      const trade = createTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
        price: MARK,
        source: "PAPER",
        fees: createZeroTradeFees(),
      });
      tx.appendTrade(trade);
      await tx.commit();
      expect((await storage.load()).trades[0]?.fees.totalFee).toBe(0);
    });
  });

  describe("Snapshot and wallet", () => {
    it("derivePerpWalletMetrics exposes fee metrics", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const { snapshot } = derivePerpWalletMetrics({
        accountId: "acc",
        initialCashBalance: 500_000,
        walletCash: state.walletCash,
        realizedPnL: state.portfolio.realizedPnL,
        trades: state.trades,
        financialEvents: state.financialEvents,
        markPrice: MARK,
        leverage: 10,
      });
      expect(snapshot.feesPaid).toBeCloseTo(MARK * TAKER, 4);
      expect(snapshot.totalFees).toBe(snapshot.feesPaid);
      expect(snapshot.walletBalance).toBeCloseTo(500_000 - MARK * TAKER, 4);
    });

    it("portfolio snapshot maps fee fields on PERP", () => {
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
          financialEvents: [],
          fundingPaid: 0,
          rebates: 0,
          insurance: 0,
          adl: 0,
          manualAdjustments: 0,
          ...ZERO_FUNDING_SNAPSHOT,
          ...ZERO_REDUCE_ONLY_SNAPSHOT,
          ...ZERO_POST_ONLY_SNAPSHOT,
          ...ZERO_MAKER_TAKER_SNAPSHOT,
        },
        perpPositions: [],
      });
      expect(snapshot.perp?.feesPaid).toBe(30);
      expect(snapshot.spot.feesPaid).toBe(0);
    });
  });

  describe("Preview", () => {
    it("buildPerpPositionPreview uses FeeModel for estimates", () => {
      const preview = buildPerpPositionPreview({
        direction: "LONG",
        margin: 6_000,
        entryPrice: MARK,
        markPrice: MARK,
        leverage: 10,
        marginMode: "CROSS",
        accountSnapshot: buildPortfolioAccountSnapshot({
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
            walletBalance: 500_000,
            availableBalance: 500_000,
            equity: 500_000,
            marginUsed: 0,
            realizedPnL: 0,
            unrealizedPnL: 0,
            ...ZERO_FEE_WALLET,
          },
          perpPositions: [],
        }),
      })!;
      expect(preview.estimatedOpeningFee).toBeCloseTo(60_000 * TAKER, 4);
      expect(preview.totalEstimatedFee).toBeCloseTo(60_000 * TAKER, 4);
    });
  });

  describe("History", () => {
    it("trade history rows include fee breakdown", async () => {
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const rows = buildTradeHistoryFromLedger(state.trades);
      expect(rows[0]?.fees.totalFee).toBeCloseTo(MARK * TAKER, 4);
    });
  });

  describe("PnL vs fees separation", () => {
    let storage: MemoryPortfolioStorage;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    });

    it("realizedPnL excludes fees; walletBalance includes fee deduction", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "CROSS",
      });
      await engine.buy(1, MARK, MARK);
      const openFee = (await engine.getState(MARK)).trades[0]!.fees.totalFee;
      await engine.sell(1, MARK + 10_000, MARK + 10_000);
      const closed = await engine.getState(MARK + 10_000);

      expect(closed.portfolio.realizedPnL).toBe(10_000);
      expect(aggregateTradeFees(closed.trades).feesPaid).toBeGreaterThan(openFee);
      expect(closed.portfolio.walletBalance).toBeLessThan(510_000);
    });

    it("hydrateTradeFees assigns zero fees to legacy trades", () => {
      const legacy = {
        id: "legacy-no-fees",
        symbol: "BTCUSDT",
        side: "BUY" as const,
        quantity: 1,
        price: MARK,
        timestamp: Date.now(),
        source: "PAPER" as const,
      };
      const hydrated = hydrateTradeFees(legacy as import("@/lib/portfolio/types").Trade);
      expect(hydrated.fees.totalFee).toBe(0);
      expect(hydrated.fees.feeModelVersion).toBe("zero-v1");
    });
  });
});
