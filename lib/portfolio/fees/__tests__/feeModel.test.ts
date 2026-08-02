import { describe, expect, it, beforeEach } from "vitest";

import { validateLedgerEntry } from "@/lib/cartera/ledger/LedgerEntrySchema";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { BINANCE_USDT_FUTURES_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";
import {
  computeClosingFee,
  computeExecutionFees,
  computeMakerFee,
  computeOpeningFee,
  computePreviewFees,
  computeTakerFee,
  FEE_MODEL_VERSION,
  resolveExecutionNotional,
} from "@/lib/portfolio/fees/FeeModel";
import { aggregateTradeFees } from "@/lib/portfolio/fees/aggregateTradeFees";
import { ZERO_FUNDING_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { buildPerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";

const MARK = 60_000;
const TAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.takerRate;
const MAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.makerRate;

describe("FeeModel (FASE 12.0)", () => {
  it("taker fee = notional × 0.05% (not margin)", () => {
    const notional = 2_000;
    const ctx = {
      side: "BUY" as const,
      quantity: notional / MARK,
      price: MARK,
      quantityBefore: 0,
      quantityAfter: notional / MARK,
      executionLiquidity: "TAKER" as const,
    };
    expect(computeTakerFee(ctx)).toBeCloseTo(notional * TAKER, 4);
    expect(computeOpeningFee(ctx)).toBeCloseTo(notional * TAKER, 4);
  });

  it("maker fee uses 0.02% when executionLiquidity is MAKER", () => {
    const ctx = {
      side: "BUY" as const,
      quantity: 1,
      price: MARK,
      quantityBefore: 0,
      quantityAfter: 1,
      executionLiquidity: "MAKER" as const,
    };
    expect(computeMakerFee(ctx)).toBeCloseTo(MARK * MAKER, 4);
    expect(computeTakerFee(ctx)).toBe(0);
  });

  it("partial close fees only closed notional", () => {
    const { closingNotional } = resolveExecutionNotional({
      side: "SELL",
      quantity: 0.5,
      price: MARK,
      quantityBefore: 1,
      quantityAfter: 0.5,
    });
    expect(closingNotional).toBe(0.5 * MARK);
    const fee = computeClosingFee({
      side: "SELL",
      quantity: 0.5,
      price: MARK,
      quantityBefore: 1,
      quantityAfter: 0.5,
      executionLiquidity: "TAKER" as const,
    });
    expect(fee).toBeCloseTo(0.5 * MARK * TAKER, 4);
  });

  it("flip charges closing + opening on one execution", () => {
    const execution = computeExecutionFees({
      side: "SELL",
      quantity: 2,
      price: MARK,
      quantityBefore: 1,
      quantityAfter: -1,
      executionLiquidity: "TAKER",
    });
    expect(execution.breakdown.closingFee).toBeCloseTo(MARK * TAKER, 4);
    expect(execution.breakdown.openingFee).toBeCloseTo(MARK * TAKER, 4);
    expect(execution.breakdown.totalFee).toBeCloseTo(2 * MARK * TAKER, 4);
  });

  describe("engine integration", () => {
    let storage: MemoryPortfolioStorage;

    beforeEach(() => {
      storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    });

    it("opening fee reduces walletBalance, not realizedPnL or entryMargin", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 20 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const pos = state.positions[0]!;
      const openFee = state.trades[0]!.fees.openingFee;

      expect(openFee).toBeCloseTo(MARK * TAKER, 4);
      expect(state.trades[0]?.executionLiquidity).toBe("TAKER");
      expect(state.portfolio.realizedPnL).toBe(0);
      expect(pos.entryMargin).toBeCloseTo(MARK / 20, 4);
      expect(state.portfolio.walletBalance).toBeCloseTo(500_000 - openFee, 4);
      expect(pos.roiPercent).toBe(0);
      expect(pos.marginRatio).toBeCloseTo(10, 1);
    });

    it("full close: realizedPnL pure, closingFee separate", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const openFee = (await engine.getState(MARK)).trades[0]!.fees.totalFee;
      await engine.sell(1, MARK + 10_000, MARK + 10_000);
      const state = await engine.getState(MARK + 10_000);
      const closeTrade = state.trades[1]!;

      expect(state.portfolio.realizedPnL).toBe(10_000);
      expect(closeTrade.fees.closingFee).toBeCloseTo((MARK + 10_000) * TAKER, 4);
      expect(aggregateTradeFees(state.trades).closingFees).toBeCloseTo(
        (MARK + 10_000) * TAKER,
        4,
      );
      expect(state.portfolio.walletBalance).toBeCloseTo(
        500_000 + 10_000 - openFee - closeTrade.fees.totalFee,
        2,
      );
    });

    it("position metrics unchanged by fees at same mark", async () => {
      const feeStorage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const noFeeEngine = createPortfolioEngine(
        new MemoryPortfolioStorage(createEmptyPersistedState(500_000)),
        new PaperBroker(),
        { leverage: 10 },
      );
      const feeEngine = createPortfolioEngine(feeStorage, new PaperBroker(), { leverage: 10 });

      await noFeeEngine.buy(1, MARK, MARK);
      await feeEngine.buy(1, MARK, MARK);

      const noFeeState = await noFeeEngine.getState(MARK + 5_000);
      const feeState = await feeEngine.getState(MARK + 5_000);

      expect(feeState.positions[0]!.entryMargin).toBe(noFeeState.positions[0]!.entryMargin);
      expect(feeState.positions[0]!.positionValue).toBe(noFeeState.positions[0]!.positionValue);
      expect(feeState.positions[0]!.roiPercent).toBe(noFeeState.positions[0]!.roiPercent);
      expect(feeState.positions[0]!.marginRatio).toBe(noFeeState.positions[0]!.marginRatio);
    });

    it("preview estimatedOpeningFee matches execution formula", () => {
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
          walletBalance: 500_000,
          availableBalance: 500_000,
          equity: 500_000,
          marginUsed: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
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
        },
        perpPositions: [],
      });

      const preview = buildPerpPositionPreview({
        direction: "LONG",
        margin: 100,
        entryPrice: MARK,
        markPrice: MARK,
        leverage: 20,
        marginMode: "CROSS",
        accountSnapshot: snapshot,
      })!;

      expect(preview.estimatedOpeningFee).toBeCloseTo(preview.quantity * MARK * TAKER, 3);
      expect(preview.totalEstimatedFee).toBe(preview.estimatedOpeningFee);

      const domainPreview = computePreviewFees({
        direction: "LONG",
        quantity: preview.quantity,
        price: MARK,
        markPrice: MARK,
        quantityBefore: 0,
      });
      expect(domainPreview.estimatedOpeningFee).toBe(preview.estimatedOpeningFee);
    });

    it("persists fees on reload without recalculation drift", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const before = await storage.load();
      const persistedFee = before.trades[0]!.fees.totalFee;

      const reloaded = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      const state = await reloaded.getState(MARK);

      expect(state.trades[0]!.fees.totalFee).toBe(persistedFee);
      expect(validateLedgerEntry(before.trades[0]).fees.totalFee).toBe(persistedFee);
    });

    it("wallet snapshot aggregates fee buckets", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        positionMode: "LONG_SHORT",
      });
      await engine.buy(1, MARK, MARK);
      await engine.sell(2, MARK + 500, MARK + 500);
      const state = await engine.getState(MARK);
      const metrics = derivePerpWalletMetrics({
        accountId: "acc",
        initialCashBalance: 500_000,
        walletCash: state.walletCash,
        realizedPnL: state.portfolio.realizedPnL,
        trades: state.trades,
        financialEvents: state.financialEvents,
        markPrice: MARK,
      }).snapshot;

      expect(metrics.openingFees).toBeGreaterThan(0);
      expect(metrics.closingFees).toBeGreaterThan(0);
      expect(metrics.fundingFees).toBe(0);
      expect(metrics.totalFees).toBe(metrics.feesPaid);
      expect(metrics.walletBalance).toBeCloseTo(
        500_000 + state.portfolio.realizedPnL - metrics.totalFees,
        2,
      );
    });

    it("history stores persisted fee breakdown", async () => {
      const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });
      await engine.buy(1, MARK, MARK);
      const state = await engine.getState(MARK);
      const rows = buildTradeHistoryFromLedger(state.trades);
      expect(rows[0]!.fees.totalFee).toBe(state.trades[0]!.fees.totalFee);
      expect(rows[0]!.fees.feeModelVersion).toBe(FEE_MODEL_VERSION);
    });
  });
});
