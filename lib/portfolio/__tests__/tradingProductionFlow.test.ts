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
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  createOrderPriceEvaluator,
  shouldTrigger,
} from "@/lib/portfolio/orderRegistry/OrderPriceEvaluator";
import { replacePositionTpSl } from "@/lib/portfolio/orderRegistry/syncPositionOrders";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { portfolioEngineRuntime } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { createLiquidationEngine } from "@/lib/portfolio/risk/LiquidationEngine";
import { createRiskScheduler } from "@/lib/portfolio/risk/RiskScheduler";

async function seedAccount(accountId: string, balance = 500_000) {
  const storage = createPortfolioStorageForAccount(accountId);
  await commitGenesisLedger(storage, balance);
}

describe("Trading production flow (v1 integration)", () => {
  beforeEach(async () => {
    memoryStore.clear();
    await portfolioEngineRuntime.resetForTests();
  });

  afterEach(async () => {
    await portfolioEngineRuntime.resetForTests();
    memoryStore.clear();
  });

  it("MARKET LONG opens position using margin only", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });

    const state = await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId: "w_long",
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 10,
        quantity: 0.02,
        margin: 100,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
    );

    expect("positions" in state && state.positions[0]?.quantity).toBe(0.02);
    expect("portfolio" in state && state.portfolio.marginUsed).toBe(100);
    expect("portfolio" in state && state.portfolio.walletBalance).toBeCloseTo(
      10_000 - openFee(0.02, 50_000),
      4,
    );
  });

  it("MARKET SHORT opens an independent short position", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 5,
      positionMode: "LONG_SHORT",
      marginMode: "CROSS",
    });

    const state = await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId: "w_short",
        direction: "SHORT",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 5,
        quantity: 0.1,
        margin: 1_000,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
    );

    expect("positions" in state && state.positions[0]?.quantity).toBe(-0.1);
    const down = await engine.getState(45_000);
    expect(down.portfolio.unrealizedPnL).toBeGreaterThan(0);
  });

  it("LIMIT registers PENDING and fills via evaluator", async () => {
    const walletId = "w_limit";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const pending = await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: 55_000,
        price: 55_000,
        marketPrice: 60_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
    );

    expect("pending" in pending && pending.pending).toBe(true);
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(1);
    expect((await engine.getState(60_000)).positions).toHaveLength(0);

    let price = 60_000;
    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => price,
    });

    price = 55_000;
    await evaluator.tick();

    const state = await engine.getState(55_000);
    expect(state.positions[0]?.quantity).toBe(1);
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
  });

  it("TP and SL register, TP fills and cancels SL", async () => {
    const walletId = "w_tpsl";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: 50_000,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: true,
        reduceOnlyEnabled: false,
        takeProfitPrice: 60_000,
        stopLossPrice: 40_000,
      }),
    );

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(2);

    let price = 50_000;
    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => price,
    });

    price = 60_000;
    await evaluator.tick();

    expect((await engine.getState(60_000)).positions).toHaveLength(0);
    const all = await orderRegistryEngine.list(walletId);
    expect(all.map((o) => o.status).sort()).toEqual(["CANCELLED", "FILLED"]);
  });

  it("STOP_MARKET and STOP_LIMIT / TP_LIMIT trigger rules are active", () => {
    expect(
      shouldTrigger(
        { orderType: "STOP_MARKET", side: "SELL", triggerPrice: 40_000 } as never,
        39_000,
      ),
    ).toBe(true);
    expect(
      shouldTrigger(
        { orderType: "STOP_LIMIT", side: "BUY", triggerPrice: 50_000 } as never,
        49_000,
      ),
    ).toBe(true);
    expect(
      shouldTrigger(
        { orderType: "TAKE_PROFIT_LIMIT", side: "SELL", triggerPrice: 70_000 } as never,
        71_000,
      ),
    ).toBe(true);
  });

  it("cancel LIMIT leaves CANCELLED record", async () => {
    const walletId = "w_cancel";
    const order = await orderRegistryEngine.register({
      walletId,
      symbol: "BTCUSDT",
      side: "BUY",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 2,
      triggerPrice: 40_000,
      quantity: 0.5,
      margin: 200,
    });

    await orderRegistryEngine.cancel(walletId, order.id);
    const all = await orderRegistryEngine.list(walletId);
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("CANCELLED");
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
  });

  it("manual close writes ledger and cancels TP/SL", async () => {
    const walletId = "w_close";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: 50_000,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: true,
        reduceOnlyEnabled: false,
        takeProfitPrice: 70_000,
        stopLossPrice: 40_000,
      }),
    );

    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "SHORT",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 1,
        margin: 50_000,
        price: 55_000,
        marketPrice: 55_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: true,
      }),
    );

    const state = await engine.getState(55_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);

    const history = buildTradeHistoryFromLedger(state.trades);
    expect(history.some((row) => row.action === "OPEN")).toBe(true);
    expect(history.some((row) => row.action === "CLOSE")).toBe(true);
  });

  it("liquidation force-closes isolated position and marks ledger", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    let price: number | null = 60_000;
    const scheduler = createRiskScheduler(engine, liquidationEngine, {
      getLastPrice: () => price,
    });

    await engine.buy(1, 60_000, 60_000);
    price = 53_000;
    await scheduler.tick();

    const state = await engine.getState(53_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades.some((t) => t.liquidation === true)).toBe(true);
    expect(buildTradeHistoryFromLedger(state.trades)[0]?.action).toBe("LIQUIDATION");
  });

  it("Cross and Isolated differ on available balance with uPnL", async () => {
    const crossStorage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const cross = createPortfolioEngine(crossStorage, new PaperBroker(), {
      leverage: 5,
      marginMode: "CROSS",
    });
    await cross.buy(1, 60_000, 60_000);
    const crossUp = await cross.getState(70_000);

    const isoStorage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const isolated = createPortfolioEngine(isoStorage, new PaperBroker(), {
      leverage: 5,
      marginMode: "ISOLATED",
    });
    await isolated.buy(1, 60_000, 60_000);
    const isoUp = await isolated.getState(70_000);

    expect(crossUp.portfolio.cashBalance).toBeGreaterThan(isoUp.portfolio.cashBalance);
  });

  it("edit TP/SL replaces registry orders for an open position", async () => {
    const walletId = "w_edit";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    await executeTradeRequest(
      engine,
      buildTradeExecutionRequest({
        walletId,
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 2,
        quantity: 1,
        margin: 30_000,
        price: 60_000,
        marketPrice: 60_000,
        tpSlEnabled: true,
        reduceOnlyEnabled: false,
        takeProfitPrice: 70_000,
        stopLossPrice: 50_000,
      }),
    );

    await replacePositionTpSl({
      walletId,
      symbol: "BTCUSDT",
      marginMode: "CROSS",
      leverage: 2,
      quantity: 1,
      margin: 30_000,
      signedQuantity: 1,
      takeProfitPrice: 80_000,
      stopLossPrice: null,
    });

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(1);
    expect(open[0]?.orderType).toBe("TAKE_PROFIT_MARKET");
    expect(open[0]?.triggerPrice).toBe(80_000);

    const all = await orderRegistryEngine.list(walletId);
    expect(all.filter((o) => o.status === "CANCELLED")).toHaveLength(2);
  });

  it("app restart restores open positions", async () => {
    await seedAccount("acc_restart_pos");
    const engine1 = await portfolioEngineRuntime.start("acc_restart_pos", {
      marketPrice: 60_000,
      leverage: 3,
    });
    await engine1.buy(1, 60_000, 60_000);
    await portfolioEngineRuntime.stop("acc_restart_pos");

    const engine2 = await portfolioEngineRuntime.start("acc_restart_pos", {
      marketPrice: 61_000,
      leverage: 3,
    });
    const state = await engine2.getState(61_000);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]?.quantity).toBe(1);
    expect(state.positions[0]?.avgEntry).toBe(60_000);
  });

  it("app restart restores pending orders", async () => {
    await seedAccount("acc_restart_ord");
    await portfolioEngineRuntime.start("acc_restart_ord", { marketPrice: 60_000 });

    await orderRegistryEngine.register({
      walletId: "acc_restart_ord",
      symbol: "BTCUSDT",
      side: "BUY",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 2,
      triggerPrice: 50_000,
      quantity: 0.25,
      margin: 100,
    });

    await portfolioEngineRuntime.stop("acc_restart_ord");
    await portfolioEngineRuntime.start("acc_restart_ord", { marketPrice: 60_000 });

    const open = await orderRegistryEngine.listOpen("acc_restart_ord");
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe("PENDING");
    expect(open[0]?.triggerPrice).toBe(50_000);
  });
});
