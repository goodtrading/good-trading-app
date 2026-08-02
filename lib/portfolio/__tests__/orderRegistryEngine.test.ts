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
import { orderRegistryStorageKey } from "@/lib/portfolio/orderRegistry/orderRegistryStorage";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  createOrderPriceEvaluator,
  shouldTrigger,
} from "@/lib/portfolio/orderRegistry/OrderPriceEvaluator";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

describe("OrderRegistryEngine (LIMIT lifecycle)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it("creating LIMIT registers PENDING without opening a position", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const order = await orderRegistryEngine.register({
      walletId: "wallet_a",
      symbol: "BTCUSDT",
      side: "BUY",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 5,
      triggerPrice: 50_000,
      quantity: 0.1,
      margin: 1000,
    });

    expect(order.status).toBe("PENDING");

    const state = await engine.getState(60_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(0);

    const open = await orderRegistryEngine.listOpen("wallet_a");
    expect(open).toHaveLength(1);
    expect(open[0]?.id).toBe(order.id);
  });

  it("cancel sets CANCELLED and never deletes", async () => {
    const order = await orderRegistryEngine.register({
      walletId: "wallet_b",
      symbol: "BTCUSDT",
      side: "SELL",
      direction: "SHORT",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 2,
      triggerPrice: 70_000,
      quantity: 0.2,
      margin: 500,
    });

    const cancelled = await orderRegistryEngine.cancel("wallet_b", order.id);
    expect(cancelled.status).toBe("CANCELLED");

    const all = await orderRegistryEngine.list("wallet_b");
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe("CANCELLED");

    const open = await orderRegistryEngine.listOpen("wallet_b");
    expect(open).toHaveLength(0);
  });

  it("evaluator fills LIMIT BUY when price drops to trigger", async () => {
    const walletId = "wallet_fill";
    memoryStore.delete(orderRegistryStorageKey(walletId));

    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    await orderRegistryEngine.register({
      walletId,
      symbol: "BTCUSDT",
      side: "BUY",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 1,
      triggerPrice: 55_000,
      quantity: 1,
      margin: 55_000,
    });

    let price = 60_000;
    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => price,
    });

    await evaluator.tick();
    expect((await engine.getState(60_000)).trades).toHaveLength(0);

    price = 55_000;
    await evaluator.tick();

    const state = await engine.getState(55_000);
    expect(state.trades).toHaveLength(1);
    expect(state.positions[0]?.quantity).toBe(1);

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(0);

    const all = await orderRegistryEngine.list(walletId);
    expect(all[0]?.status).toBe("FILLED");
  });

  it("orders persist across registry reloads", async () => {
    await orderRegistryEngine.register({
      walletId: "wallet_persist",
      symbol: "BTCUSDT",
      side: "BUY",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "CROSS",
      leverage: 3,
      triggerPrice: 40_000,
      quantity: 0.5,
      margin: 200,
    });

    const reloaded = await orderRegistryEngine.listOpen("wallet_persist");
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]?.triggerPrice).toBe(40_000);
  });

  it("shouldTrigger encodes LIMIT buy/sell rules", () => {
    const buy = {
      orderType: "LIMIT" as const,
      side: "BUY" as const,
      triggerPrice: 50_000,
    };
    const sell = {
      orderType: "LIMIT" as const,
      side: "SELL" as const,
      triggerPrice: 70_000,
    };

    expect(shouldTrigger({ ...buy } as never, 49_000)).toBe(true);
    expect(shouldTrigger({ ...buy } as never, 51_000)).toBe(false);
    expect(shouldTrigger({ ...sell } as never, 71_000)).toBe(true);
    expect(shouldTrigger({ ...sell } as never, 69_000)).toBe(false);
  });

  it("shouldTrigger encodes STOP and TAKE_PROFIT by orderType + side", () => {
    const stopLong = {
      orderType: "STOP_MARKET" as const,
      side: "SELL" as const,
      triggerPrice: 45_000,
    };
    const tpLong = {
      orderType: "TAKE_PROFIT_MARKET" as const,
      side: "SELL" as const,
      triggerPrice: 70_000,
    };
    const stopShort = {
      orderType: "STOP_MARKET" as const,
      side: "BUY" as const,
      triggerPrice: 55_000,
    };
    const tpShort = {
      orderType: "TAKE_PROFIT_MARKET" as const,
      side: "BUY" as const,
      triggerPrice: 40_000,
    };

    expect(shouldTrigger({ ...stopLong } as never, 44_000)).toBe(true);
    expect(shouldTrigger({ ...stopLong } as never, 46_000)).toBe(false);
    expect(shouldTrigger({ ...tpLong } as never, 71_000)).toBe(true);
    expect(shouldTrigger({ ...tpLong } as never, 69_000)).toBe(false);
    expect(shouldTrigger({ ...stopShort } as never, 56_000)).toBe(true);
    expect(shouldTrigger({ ...stopShort } as never, 54_000)).toBe(false);
    expect(shouldTrigger({ ...tpShort } as never, 39_000)).toBe(true);
    expect(shouldTrigger({ ...tpShort } as never, 41_000)).toBe(false);
  });
});

describe("OrderRegistryEngine (TP/SL lifecycle)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  afterEach(() => {
    memoryStore.clear();
  });

  it("MARKET open registers TP and SL as PENDING linked to positionId", async () => {
    const walletId = "wallet_tpsl";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const { executeTradeRequest } = await import(
      "@/lib/portfolio/trade/executeTradeRequest"
    );
    const { buildTradeExecutionRequest } = await import(
      "@/lib/portfolio/trade/TradeExecutionRequest"
    );
    const { buildPositionId } = await import(
      "@/lib/portfolio/orderRegistry/OrderEntity"
    );

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
        stopLossPrice: 45_000,
      }),
    );

    const state = await engine.getState(50_000);
    expect(state.positions).toHaveLength(1);
    expect(state.trades).toHaveLength(1);

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(2);
    expect(open.every((o) => o.status === "PENDING")).toBe(true);
    expect(open.every((o) => o.positionId === buildPositionId(walletId, "BTCUSDT"))).toBe(
      true,
    );
    expect(open.map((o) => o.orderType).sort()).toEqual([
      "STOP_MARKET",
      "TAKE_PROFIT_MARKET",
    ]);
  });

  it("evaluator fills TAKE_PROFIT and cancels sibling SL", async () => {
    const walletId = "wallet_tp_fill";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const { executeTradeRequest } = await import(
      "@/lib/portfolio/trade/executeTradeRequest"
    );
    const { buildTradeExecutionRequest } = await import(
      "@/lib/portfolio/trade/TradeExecutionRequest"
    );

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
        stopLossPrice: 45_000,
      }),
    );

    let price = 50_000;
    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => price,
    });

    await evaluator.tick();
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(2);

    price = 70_000;
    await evaluator.tick();

    const state = await engine.getState(70_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(0);

    const all = await orderRegistryEngine.list(walletId);
    const statuses = all.map((o) => o.status).sort();
    expect(statuses).toEqual(["CANCELLED", "FILLED"]);
  });

  it("manual position close cancels linked TP/SL without deleting", async () => {
    const walletId = "wallet_close_cancel";
    const storage = createPortfolioStorageForAccount(walletId);
    await commitGenesisLedger(storage, 500_000);
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const { executeTradeRequest } = await import(
      "@/lib/portfolio/trade/executeTradeRequest"
    );
    const { buildTradeExecutionRequest } = await import(
      "@/lib/portfolio/trade/TradeExecutionRequest"
    );

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
        stopLossPrice: 45_000,
      }),
    );

    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(2);

    // Close long with MARKET sell (no TP/SL on close request).
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

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(0);

    const all = await orderRegistryEngine.list(walletId);
    expect(all).toHaveLength(2);
    expect(all.every((o) => o.status === "CANCELLED")).toBe(true);

    const state = await engine.getState(55_000);
    expect(state.positions).toHaveLength(0);
  });
});
