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
import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import { BINANCE_USDT_FUTURES_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";
import { makerFee, takerFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildPerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { ZERO_FUNDING_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";

const MARK = 50_000;
const TAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.takerRate;
const MAKER = BINANCE_USDT_FUTURES_FEE_SCHEDULE.makerRate;

async function setupEngine(walletId: string) {
  const storage = createPortfolioStorageForAccount(walletId);
  await commitGenesisLedger(storage, 500_000);
  const engine = createPortfolioEngine(storage, new PaperBroker());
  return { storage, engine, walletId };
}

function emptySnapshot(accountId: string) {
  return buildPortfolioAccountSnapshot({
    accountId,
    markPrice: MARK,
    spotWallet: {
      accountId,
      usdtFree: 0,
      usdtLocked: 0,
      usdtTotal: 0,
      balances: [],
    },
    spotPositions: [],
    perpWallet: {
      accountId,
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
}

describe("ExecutionLiquidity (FASE 12.5)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it("MARKET execution is TAKER with taker fee rate", async () => {
    const { engine } = await setupEngine("liq_market");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId: "liq_market",
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: MARK,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: false,
      }),
    );

    const state = await engine.getState(MARK);
    const trade = state.trades[0]!;
    expect(trade.executionLiquidity).toBe("TAKER");
    expect(trade.fees.totalFee).toBeCloseTo(takerFee(MARK), 4);
    expect(trade.fees.breakdown.takerFee).toBeCloseTo(takerFee(MARK), 4);
    expect(trade.fees.breakdown.makerFee).toBe(0);
  });

  it("LIMIT resting registers MAKER and fills with maker fee", async () => {
    const { engine, walletId } = await setupEngine("liq_limit_maker");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: 49_000,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: false,
      }),
    );

    const order = (await orderRegistryEngine.listOpen(walletId))[0]!;
    expect(order.executionLiquidity).toBe("MAKER");

    await executionRouter.dispatch(engine, {
      type: "FILL_REGISTERED_ORDER",
      domain: "PERP",
      walletId,
      order,
      marketPrice: 49_000,
    });

    const state = await engine.getState(49_000);
    const trade = state.trades[0]!;
    expect(trade.executionLiquidity).toBe("MAKER");
    expect(trade.fees.totalFee).toBeCloseTo(makerFee(49_000), 4);
  });

  it("LIMIT crossing market registers TAKER and fills with taker fee", async () => {
    const { engine, walletId } = await setupEngine("liq_limit_taker");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: MARK + 100,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: false,
      }),
    );

    const order = (await orderRegistryEngine.listOpen(walletId))[0]!;
    expect(order.executionLiquidity).toBe("TAKER");

    await executionRouter.dispatch(engine, {
      type: "FILL_REGISTERED_ORDER",
      domain: "PERP",
      walletId,
      order,
      marketPrice: MARK + 100,
    });

    const trade = (await engine.getState(MARK + 100)).trades[0]!;
    expect(trade.executionLiquidity).toBe("TAKER");
    expect(trade.fees.totalFee).toBeCloseTo(takerFee(MARK + 100), 4);
  });

  it("POST ONLY fills with maker fee", async () => {
    const { engine, walletId } = await setupEngine("liq_post_only");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: 49_000,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: true,
      }),
    );

    const order = (await orderRegistryEngine.listOpen(walletId))[0]!;
    await executionRouter.dispatch(engine, {
      type: "FILL_REGISTERED_ORDER",
      domain: "PERP",
      walletId,
      order,
      marketPrice: 49_000,
    });

    const trade = (await engine.getState(49_000)).trades[0]!;
    expect(trade.postOnly).toBe(true);
    expect(trade.executionLiquidity).toBe("MAKER");
    expect(trade.fees.breakdown.makerFee).toBeGreaterThan(0);
  });

  it("preview estimates taker for MARKET and maker for resting LIMIT", () => {
    const snapshot = emptySnapshot("acc");

    const marketPreview = buildPerpPositionPreview({
      direction: "LONG",
      margin: 100,
      entryPrice: MARK,
      markPrice: MARK,
      leverage: 10,
      marginMode: "CROSS",
      accountSnapshot: snapshot,
      orderType: "MARKET",
    })!;
    expect(marketPreview.estimatedOpeningFee).toBeCloseTo(
      marketPreview.totalEstimatedFee * (TAKER / TAKER),
      4,
    );

    const limitPreview = buildPerpPositionPreview({
      direction: "LONG",
      margin: 100,
      entryPrice: 49_000,
      markPrice: MARK,
      leverage: 10,
      marginMode: "CROSS",
      accountSnapshot: snapshot,
      orderType: "LIMIT",
    })!;
    const qty = limitPreview.quantity;
    expect(limitPreview.estimatedOpeningFee).toBeCloseTo(qty * 49_000 * MAKER, 2);

    const crossPreview = buildPerpPositionPreview({
      direction: "LONG",
      margin: 100,
      entryPrice: MARK + 100,
      markPrice: MARK,
      leverage: 10,
      marginMode: "CROSS",
      accountSnapshot: snapshot,
      orderType: "LIMIT",
    })!;
    expect(crossPreview.estimatedOpeningFee).toBeGreaterThan(
      crossPreview.quantity * (MARK + 100) * MAKER,
    );
  });

  it("snapshot aggregates maker/taker from financial events", async () => {
    const { engine, walletId, storage } = await setupEngine("liq_snapshot");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: MARK,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: false,
      }),
    );

    const persisted = await storage.load();
    const metrics = derivePerpWalletMetrics({
      accountId: walletId,
      initialCashBalance: persisted.initialCashBalance,
      walletCash: persisted.walletCash ?? persisted.initialCashBalance,
      realizedPnL: 0,
      trades: persisted.trades,
      financialEvents: persisted.financialEvents,
      markPrice: MARK,
    }).snapshot;

    expect(metrics.takerTrades).toBe(1);
    expect(metrics.makerTrades).toBe(0);
    expect(metrics.takerFees).toBeCloseTo(takerFee(MARK), 4);
    expect(metrics.makerFees).toBe(0);
  });

  it("history and reload preserve executionLiquidity", async () => {
    const { engine, walletId, storage } = await setupEngine("liq_reload");
    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: MARK,
        price: MARK,
        marketPrice: MARK,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
        postOnlyEnabled: false,
      }),
    );

    const persisted = await storage.load();
    const history = buildTradeHistoryFromLedger(persisted.trades);
    expect(history[0]?.executionLiquidity).toBe("TAKER");

    const reloaded = createPortfolioEngine(storage, new PaperBroker());
    const state = await reloaded.restoreState({
      initialCashBalance: persisted.initialCashBalance,
      walletCash: persisted.walletCash,
      trades: persisted.trades,
      financialEvents: persisted.financialEvents,
      marketPrice: MARK,
    });
    expect(state.trades[0]?.executionLiquidity).toBe("TAKER");
    expect(state.trades[0]?.fees.breakdown.takerFee).toBeGreaterThan(0);
  });
});
