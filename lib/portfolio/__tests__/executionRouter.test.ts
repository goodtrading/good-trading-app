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

import {
  SpotNotSupportedError,
  executionRouter,
  isSpotDispatchResult,
  toExecutionRequest,
} from "@/lib/portfolio/domain/ExecutionRouter";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { portfolioTradesStorageKey } from "@/lib/portfolio/accounts/accountStorage";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

describe("ExecutionRouter (Phase 6 — SPOT real)", () => {
  beforeEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  afterEach(() => {
    memoryStore.clear();
    spotLedgerRuntime.stopAll();
  });

  it("rejects SPOT leverage, margin, market short, tp/sl", async () => {
    const engine = createPortfolioEngine(
      new MemoryPortfolioStorage(createEmptyPersistedState(10_000)),
      new PaperBroker(),
    );

    const cases = [
      buildTradeExecutionRequest({
        domain: "SPOT",
        walletId: "w1",
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 5,
        quantity: 0.01,
        margin: 100,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
      buildTradeExecutionRequest({
        domain: "SPOT",
        walletId: "w1",
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "ISOLATED",
        leverage: 1,
        quantity: 0.01,
        margin: 500,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
      buildTradeExecutionRequest({
        domain: "SPOT",
        walletId: "w1",
        direction: "LONG",
        orderType: "MARKET",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 0.01,
        margin: 500,
        price: 50_000,
        marketPrice: 50_000,
        tpSlEnabled: true,
        reduceOnlyEnabled: false,
        takeProfitPrice: 60_000,
      }),
    ];

    for (const request of cases) {
      await expect(
        executionRouter.execute(engine, toExecutionRequest(request)),
      ).rejects.toThrow("Not supported in SPOT");
      await expect(
        executionRouter.execute(engine, toExecutionRequest(request)),
      ).rejects.toThrow(SpotNotSupportedError);
    }
  });

  it("SPOT LIMIT BUY places order via SpotOrderRegistry only", async () => {
    await spotLedgerRuntime.start("spot_lim", { initialUsdt: 10_000 });

    const result = await executionRouter.execute(null, toExecutionRequest(
      buildTradeExecutionRequest({
        domain: "SPOT",
        walletId: "spot_lim",
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        quantity: 0.1,
        margin: 5_000,
        price: 50_000,
        marketPrice: 55_000,
        tpSlEnabled: false,
        reduceOnlyEnabled: false,
      }),
    ));

    expect(isSpotDispatchResult(result)).toBe(true);
    if (isSpotDispatchResult(result) && "pending" in result) {
      expect(result.pending).toBe(true);
      expect(result.order.status).toBe("PENDING");
      expect(result.state.balances.find((b) => b.asset === "USDT")?.locked).toBe(5_000);
    }

    expect(memoryStore.has(portfolioTradesStorageKey("spot_lim"))).toBe(false);
  });

  it("SPOT BUY MARKET writes SpotLedger only — never PERP trades/v1", async () => {
    await spotLedgerRuntime.start("spot_wallet", { initialUsdt: 10_000 });

    const perpStorage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000));
    const engine = createPortfolioEngine(perpStorage, new PaperBroker());

    const request = buildTradeExecutionRequest({
      domain: "SPOT",
      walletId: "spot_wallet",
      direction: "LONG",
      orderType: "MARKET",
      marginMode: "CROSS",
      leverage: 1,
      quantity: 0.1,
      margin: 5_000,
      price: 50_000,
      marketPrice: 50_000,
      tpSlEnabled: false,
      reduceOnlyEnabled: false,
    });

    const result = await executionRouter.execute(engine, toExecutionRequest(request));
    expect(isSpotDispatchResult(result)).toBe(true);
    if (isSpotDispatchResult(result)) {
      expect(result.trade.domain).toBe("SPOT");
      expect(result.state.balances.find((b) => b.asset === "BTC")?.free).toBe(0.1);
      expect(result.state.balances.find((b) => b.asset === "USDT")?.free).toBe(5_000);
    }

    // PERP engine untouched
    const perpState = await engine.getState(50_000);
    expect(perpState.positions).toHaveLength(0);
    expect(perpState.trades).toHaveLength(0);

    // No PERP trades key written for this wallet
    expect(memoryStore.has(portfolioTradesStorageKey("spot_wallet"))).toBe(false);
  });

  it("SPOT SELL MARKET via SELL command uses SpotLedger", async () => {
    await spotLedgerRuntime.start("spot_sell", { initialUsdt: 10_000 });

    await executionRouter.dispatch(null, {
      type: "BUY",
      domain: "SPOT",
      walletId: "spot_sell",
      quantity: 0.2,
      price: 50_000,
      marketPrice: 50_000,
    });

    const result = await executionRouter.dispatch(null, {
      type: "SELL",
      domain: "SPOT",
      walletId: "spot_sell",
      quantity: 0.1,
      price: 60_000,
      marketPrice: 60_000,
    });

    expect(isSpotDispatchResult(result as never)).toBe(true);
    const spot = result as {
      domain: "SPOT";
      state: { balances: { asset: string; free: number }[] };
    };
    expect(spot.state.balances.find((b) => b.asset === "BTC")?.free).toBeCloseTo(0.1);
    expect(spot.state.balances.find((b) => b.asset === "USDT")?.free).toBe(6_000);
  });

  it("SPOT SELL MARKET via executeTrade uses SpotLedger inventory", async () => {
    await spotLedgerRuntime.start("spot_mkt_sell", { initialUsdt: 10_000 });

    await executionRouter.dispatch(null, {
      type: "BUY",
      domain: "SPOT",
      walletId: "spot_mkt_sell",
      quantity: 0.2,
      price: 50_000,
      marketPrice: 50_000,
    });

    const result = await executionRouter.execute(
      null,
      toExecutionRequest(
        buildTradeExecutionRequest({
          domain: "SPOT",
          walletId: "spot_mkt_sell",
          direction: "SHORT",
          orderType: "MARKET",
          marginMode: "CROSS",
          leverage: 1,
          quantity: 0.1,
          margin: 5_000,
          price: 60_000,
          marketPrice: 60_000,
          tpSlEnabled: false,
          reduceOnlyEnabled: false,
        }),
      ),
    );

    expect(isSpotDispatchResult(result)).toBe(true);
    if (isSpotDispatchResult(result)) {
      expect(result.trade.side).toBe("SELL");
      expect(result.state.balances.find((b) => b.asset === "BTC")?.free).toBeCloseTo(0.1);
    }
  });

  it("SPOT CLOSE_POSITION sells 100% inventory", async () => {
    await spotLedgerRuntime.start("spot_close", { initialUsdt: 10_000 });

    await executionRouter.dispatch(null, {
      type: "BUY",
      domain: "SPOT",
      walletId: "spot_close",
      quantity: 0.2,
      price: 50_000,
      marketPrice: 50_000,
    });

    const result = await executionRouter.dispatch(null, {
      type: "CLOSE_POSITION",
      domain: "SPOT",
      walletId: "spot_close",
      symbol: "BTCUSDT",
      marketPrice: 55_000,
    });

    expect(isSpotDispatchResult(result as never)).toBe(true);
    const spot = result as { state: { balances: { asset: string; free: number }[] } };
    expect(spot.state.balances.find((b) => b.asset === "BTC")?.free ?? 0).toBe(0);
  });

  it("SPOT UPDATE_POSITION_TPSL creates Spot orders only", async () => {
    await spotLedgerRuntime.start("spot_tpsl", { initialUsdt: 10_000 });

    await executionRouter.dispatch(null, {
      type: "BUY",
      domain: "SPOT",
      walletId: "spot_tpsl",
      quantity: 0.1,
      price: 50_000,
      marketPrice: 50_000,
    });

    const result = await executionRouter.dispatch(null, {
      type: "UPDATE_POSITION_TPSL",
      domain: "SPOT",
      walletId: "spot_tpsl",
      symbol: "BTCUSDT",
      marketPrice: 50_000,
      takeProfitPrice: 60_000,
      stopLossPrice: 45_000,
    });

    expect(result).toMatchObject({ domain: "SPOT" });
    expect(memoryStore.has(portfolioTradesStorageKey("spot_tpsl"))).toBe(false);
  });

  it("SPOT rejects liquidate without touching ledgers", async () => {
    await spotLedgerRuntime.start("spot_reject", { initialUsdt: 1_000 });
    const before = await spotLedgerRuntime.getState("spot_reject");

    const engine = createPortfolioEngine(
      new MemoryPortfolioStorage(createEmptyPersistedState(10_000)),
      new PaperBroker(),
    );

    await expect(
      executionRouter.dispatch(engine, {
        type: "FORCE_LIQUIDATE",
        domain: "SPOT",
        walletId: "spot_reject",
        symbol: "BTCUSDT",
        marketPrice: 50_000,
      }),
    ).rejects.toThrow("Not supported in SPOT");

    const after = await spotLedgerRuntime.getState("spot_reject");
    expect(after?.balances).toEqual(before?.balances);
    expect(after?.trades).toEqual(before?.trades);

    const perp = await engine.getState(50_000);
    expect(perp.trades).toHaveLength(0);
  });

  it("SPOT CANCEL_ORDER unlocks via SpotOrderRegistry", async () => {
    await spotLedgerRuntime.start("spot_cancel", { initialUsdt: 10_000 });

    const placed = await executionRouter.execute(
      null,
      toExecutionRequest(
        buildTradeExecutionRequest({
          domain: "SPOT",
          walletId: "spot_cancel",
          direction: "LONG",
          orderType: "LIMIT",
          marginMode: "CROSS",
          leverage: 1,
          quantity: 0.1,
          margin: 5_000,
          price: 50_000,
          marketPrice: 55_000,
          tpSlEnabled: false,
          reduceOnlyEnabled: false,
        }),
      ),
    );

    expect(isSpotDispatchResult(placed) && "order" in placed).toBe(true);
    const orderId =
      isSpotDispatchResult(placed) && "order" in placed ? placed.order.id : "";

    const cancelled = await executionRouter.dispatch(null, {
      type: "CANCEL_ORDER",
      domain: "SPOT",
      walletId: "spot_cancel",
      orderId,
    });

    expect(isSpotDispatchResult(cancelled as never)).toBe(true);
    const spot = cancelled as {
      domain: "SPOT";
      order: { status: string };
      state: { balances: { asset: string; free: number; locked: number }[]; trades: unknown[] };
    };
    expect(spot.order.status).toBe("CANCELLED");
    expect(spot.state.balances.find((b) => b.asset === "USDT")?.free).toBe(10_000);
    expect(spot.state.balances.find((b) => b.asset === "USDT")?.locked).toBe(0);
    expect(spot.state.trades).toHaveLength(0);
  });

  it("PERP path unchanged", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(10_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 10 });

    const request = buildTradeExecutionRequest({
      domain: "PERP",
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
    });

    const result = await executionRouter.execute(engine, toExecutionRequest(request));
    expect(isSpotDispatchResult(result)).toBe(false);
    expect("positions" in result && result.positions[0]?.quantity).toBe(0.02);
    expect("portfolio" in result && result.portfolio.marginUsed).toBe(100);
  });
});
