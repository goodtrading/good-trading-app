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
import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import { replacePositionTpSl } from "@/lib/portfolio/orderRegistry/syncPositionOrders";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  applyTrailingMarkUpdate,
  shouldTriggerTrailing,
  trailingTriggerPrice,
} from "@/lib/portfolio/trailing/TrailingStopEvaluator";
import { buildTrailingStop } from "@/lib/portfolio/trailing/TrailingStopBuilder";
import { createTrailingStopPriceEvaluator } from "@/lib/portfolio/trailing/TrailingStopPriceEvaluator";
import { trailingStopRuntime } from "@/lib/portfolio/trailing/TrailingStopRuntime";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import { WalletService } from "@/lib/portfolio/wallets/WalletService";

const MARK = 50_000;
const SYMBOL = "BTCUSDT";

async function setupEngine(walletId: string, balance = 500_000) {
  const storage = createPortfolioStorageForAccount(walletId);
  await commitGenesisLedger(storage, balance);
  const engine = createPortfolioEngine(storage, new PaperBroker());
  return { storage, engine, walletId };
}

async function openLong(
  engine: ReturnType<typeof createPortfolioEngine>,
  walletId: string,
  quantity = 1,
) {
  await executeTradeRequest(
    engine,
    buildTradeExecutionRequest({
      walletId,
      direction: "LONG",
      orderType: "MARKET",
      marginMode: "CROSS",
      leverage: 1,
      quantity,
      margin: quantity * MARK,
      price: MARK,
      marketPrice: MARK,
      tpSlEnabled: false,
      reduceOnlyEnabled: false,
    }),
  );
}

async function registerTrailing(
  engine: ReturnType<typeof createPortfolioEngine>,
  walletId: string,
  opts: {
    positionSide: "LONG" | "SHORT";
    quantity?: number;
    callbackRate?: number;
    activationPrice?: number;
    marketPrice?: number;
  },
) {
  return executionRouter.dispatch(engine, {
    type: "REGISTER_TRAILING_STOP",
    domain: "PERP",
    walletId,
    symbol: SYMBOL,
    positionSide: opts.positionSide,
    quantity: opts.quantity ?? 1,
    callbackRate: opts.callbackRate ?? 1.5,
    activationPrice: opts.activationPrice,
    marketPrice: opts.marketPrice ?? MARK,
  }) as Promise<{ trailingStop: import("@/lib/portfolio/trailing/TrailingStop").TrailingStop }>;
}

describe("TrailingStop evaluator (unit)", () => {
  it("updates highestPrice on LONG when mark rises", () => {
    const stop = buildTrailingStop({
      walletId: "w",
      symbol: SYMBOL,
      positionSide: "LONG",
      quantity: 1,
      callbackRate: 1.5,
      markPrice: MARK,
    });

    const updated = applyTrailingMarkUpdate(stop, 55_000);
    expect(updated?.highestPrice).toBe(55_000);
    expect(updated?.lowestPrice).toBe(MARK);
  });

  it("updates lowestPrice on SHORT when mark falls", () => {
    const stop = buildTrailingStop({
      walletId: "w",
      symbol: SYMBOL,
      positionSide: "SHORT",
      quantity: 1,
      callbackRate: 1.5,
      markPrice: MARK,
    });

    const updated = applyTrailingMarkUpdate(stop, 45_000);
    expect(updated?.lowestPrice).toBe(45_000);
    expect(updated?.highestPrice).toBe(MARK);
  });

  it("triggers LONG when mark retraces callbackRate from highest", () => {
    let stop = buildTrailingStop({
      walletId: "w",
      symbol: SYMBOL,
      positionSide: "LONG",
      quantity: 1,
      callbackRate: 2,
      markPrice: MARK,
    });
    stop = applyTrailingMarkUpdate(stop, 60_000)!;
    expect(trailingTriggerPrice(stop)).toBeCloseTo(58_800);
    expect(shouldTriggerTrailing(stop, 58_800)).toBe(true);
    expect(shouldTriggerTrailing(stop, 58_900)).toBe(false);
  });

  it("triggers SHORT when mark rises callbackRate from lowest", () => {
    let stop = buildTrailingStop({
      walletId: "w",
      symbol: SYMBOL,
      positionSide: "SHORT",
      quantity: 1,
      callbackRate: 2,
      markPrice: MARK,
    });
    stop = applyTrailingMarkUpdate(stop, 40_000)!;
    expect(trailingTriggerPrice(stop)).toBeCloseTo(40_800);
    expect(shouldTriggerTrailing(stop, 40_800)).toBe(true);
    expect(shouldTriggerTrailing(stop, 40_700)).toBe(false);
  });

  it("respects optional activationPrice before tracking", () => {
    const stop = buildTrailingStop({
      walletId: "w",
      symbol: SYMBOL,
      positionSide: "LONG",
      quantity: 1,
      callbackRate: 1.5,
      activationPrice: 52_000,
      markPrice: MARK,
    });

    expect(applyTrailingMarkUpdate(stop, 51_000)).toBeNull();
    expect(shouldTriggerTrailing(stop, 49_000)).toBe(false);
  });
});

describe("Trailing Stop (FASE 12.8)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("registers trailing stop for LONG in ONE_WAY mode", async () => {
    const { engine, walletId } = await setupEngine("trail_long_reg");
    await openLong(engine, walletId);

    const { trailingStop } = await registerTrailing(engine, walletId, { positionSide: "LONG" });
    expect(trailingStop.status).toBe("ACTIVE");
    expect(trailingStop.positionSide).toBe("LONG");
    expect(trailingStop.side).toBe("SELL");
    expect(trailingStop.callbackRate).toBe(1.5);
    expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(1);
  });

  it("registers trailing stop for SHORT in ONE_WAY mode", async () => {
    const { engine, walletId } = await setupEngine("trail_short_reg");
    engine.setPositionMode("LONG_SHORT");
    await engine.sell(1, MARK, MARK);

    const { trailingStop } = await registerTrailing(engine, walletId, { positionSide: "SHORT" });
    expect(trailingStop.positionSide).toBe("SHORT");
    expect(trailingStop.side).toBe("BUY");
  });

  it("tracks extremes and triggers LONG close via evaluator", async () => {
    const { engine, walletId } = await setupEngine("trail_long_trigger");
    await openLong(engine, walletId);

    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 2 });

    await trailingStopRuntime.evaluateMarkUpdates(walletId, 60_000);

    const evaluator = createTrailingStopPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 58_700,
    });
    await evaluator.tick();

    const stops = await trailingStopRuntime.list(walletId);
    expect(stops[0]?.status).toBe("TRIGGERED");

    const state = await engine.getState(58_700);
    expect(state.positions[0]?.quantity ?? 0).toBe(0);

    const closeTrade = state.trades.find((t) => t.side === "SELL" && t.reduceOnly);
    expect(closeTrade?.triggerReason).toBe("TRAILING_STOP");
  });

  it("tracks extremes and triggers SHORT close via evaluator", async () => {
    const { engine, walletId } = await setupEngine("trail_short_trigger");
    engine.setPositionMode("LONG_SHORT");
    await engine.sell(1, MARK, MARK);

    await registerTrailing(engine, walletId, { positionSide: "SHORT", callbackRate: 2 });

    await trailingStopRuntime.evaluateMarkUpdates(walletId, 40_000);

    const evaluator = createTrailingStopPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 40_900,
    });
    await evaluator.tick();

    const stops = await trailingStopRuntime.list(walletId);
    expect(stops[0]?.status).toBe("TRIGGERED");

    const state = await engine.getState(40_900);
    const closeTrade = state.trades.find((t) => t.side === "BUY" && t.reduceOnly);
    expect(closeTrade?.triggerReason).toBe("TRAILING_STOP");
  });

  it("supports manual cancellation", async () => {
    const { engine, walletId } = await setupEngine("trail_cancel");
    await openLong(engine, walletId);
    const { trailingStop } = await registerTrailing(engine, walletId, { positionSide: "LONG" });

    await executionRouter.dispatch(engine, {
      type: "CANCEL_TRAILING_STOP",
      domain: "PERP",
      walletId,
      trailingStopId: trailingStop.id,
    });

    expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(0);
    expect((await trailingStopRuntime.list(walletId))[0]?.status).toBe("CANCELLED");
  });

  it("cancels OCO groups when trailing stop triggers", async () => {
    const { engine, walletId } = await setupEngine("trail_oco");
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
        tpSlEnabled: true,
        reduceOnlyEnabled: false,
        takeProfitPrice: 80_000,
        stopLossPrice: 40_000,
      }),
    );
    expect(await ocoRuntime.listActive(walletId)).toHaveLength(1);

    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 2 });
    await trailingStopRuntime.evaluateMarkUpdates(walletId, 60_000);

    await executionRouter.dispatch(engine, {
      type: "TRIGGER_TRAILING_STOP",
      domain: "PERP",
      walletId,
      trailingStopId: (await trailingStopRuntime.listActive(walletId))[0]!.id,
      marketPrice: 58_700,
    });

    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    expect((await ocoRuntime.list(walletId))[0]?.status).toBe("CANCELLED");
  });

  it("supports independent trailing stops for HEDGE LONG and SHORT legs", async () => {
    const { engine, walletId } = await setupEngine("trail_hedge", 1_000_000);
    engine.setAccountPositionMode("HEDGE");
    await engine.buy(0.5, MARK, MARK);
    await engine.sell(0.3, MARK, MARK);

    const state = await engine.getState(MARK);
    const longLeg = state.positions.find((p) => p.side === "LONG")!;
    const shortLeg = state.positions.find((p) => p.side === "SHORT")!;

    await registerTrailing(engine, walletId, {
      positionSide: "LONG",
      quantity: longLeg.quantity,
      callbackRate: 1.5,
    });
    await registerTrailing(engine, walletId, {
      positionSide: "SHORT",
      quantity: shortLeg.quantity,
      callbackRate: 1.5,
    });

    expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(2);
    const sides = new Set((await trailingStopRuntime.listActive(walletId)).map((s) => s.positionSide));
    expect(sides).toEqual(new Set(["LONG", "SHORT"]));

    await trailingStopRuntime.evaluateMarkUpdates(walletId, 60_000);
    const longStop = (await trailingStopRuntime.listActive(walletId)).find((s) => s.positionSide === "LONG")!;
    await executionRouter.dispatch(engine, {
      type: "TRIGGER_TRAILING_STOP",
      domain: "PERP",
      walletId,
      trailingStopId: longStop.id,
      marketPrice: 58_500,
    });

    const active = await trailingStopRuntime.listActive(walletId);
    expect(active).toHaveLength(1);
    expect(active[0]?.positionSide).toBe("SHORT");
  });

  it("cancels trailing when position leg is closed manually", async () => {
    const { engine, walletId } = await setupEngine("trail_flat");
    await openLong(engine, walletId);
    await registerTrailing(engine, walletId, { positionSide: "LONG" });
    expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(1);

    await executionRouter.dispatch(engine, {
      type: "CLOSE_POSITION",
      domain: "PERP",
      walletId,
      symbol: SYMBOL,
      marketPrice: MARK,
    });

    expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(0);
    expect((await trailingStopRuntime.list(walletId))[0]?.status).toBe("CANCELLED");
  });

  it("persists and reloads trailing stops from storage", async () => {
    const walletId = "trail_persist";
    const { engine } = await setupEngine(walletId);
    await openLong(engine, walletId);
    const { trailingStop } = await registerTrailing(engine, walletId, { positionSide: "LONG" });

    const reloaded = await trailingStopRuntime.listActive(walletId);
    expect(reloaded[0]?.id).toBe(trailingStop.id);
    expect(reloaded[0]?.callbackRate).toBe(1.5);
  });

  it("exposes openTrailingStops in wallet snapshot", async () => {
    const { engine, walletId } = await setupEngine("trail_snapshot");
    await openLong(engine, walletId);
    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 2.5 });

    const walletService = new WalletService();
    const snapshot = await walletService.getPerpWallet(walletId, MARK);
    expect(snapshot.openTrailingStops.length).toBe(1);
    expect(snapshot.openTrailingStops[0]?.side).toBe("LONG");
    expect(snapshot.openTrailingStops[0]?.callbackRate).toBe(2.5);
  });

  it("records triggerReason TRAILING_STOP in trade history", async () => {
    const { engine, walletId } = await setupEngine("trail_history");
    await openLong(engine, walletId);
    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 2 });
    await trailingStopRuntime.evaluateMarkUpdates(walletId, 60_000);

    const evaluator = createTrailingStopPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 58_700,
    });
    await evaluator.tick();

    const state = await engine.getState(58_700);
    const history = buildTradeHistoryFromLedger(state.trades);
    const row = history.find((r) => r.triggerReason === "TRAILING_STOP");
    expect(row).toBeDefined();
    expect(row?.action).toBe("CLOSE");
  });

  it("replaces existing trailing on same leg when registering again", async () => {
    const { engine, walletId } = await setupEngine("trail_replace");
    await openLong(engine, walletId);
    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 1 });
    await registerTrailing(engine, walletId, { positionSide: "LONG", callbackRate: 3 });

    const active = await trailingStopRuntime.listActive(walletId);
    expect(active).toHaveLength(1);
    expect(active[0]?.callbackRate).toBe(3);
    expect((await trailingStopRuntime.list(walletId)).filter((s) => s.status === "CANCELLED")).toHaveLength(1);
  });

  it("stress: many sequential trailing triggers stay reduce-only", async () => {
    for (let i = 0; i < 50; i++) {
      memoryStore.clear();
      const walletId = `trail_stress_${i}`;
      const { engine } = await setupEngine(walletId, 2_000_000);
      await openLong(engine, walletId, 0.1);

      await registerTrailing(engine, walletId, {
        positionSide: "LONG",
        quantity: 0.1,
        callbackRate: 1 + i * 0.01,
      });

      const peak = MARK + 5_000 + i * 50;
      await trailingStopRuntime.evaluateMarkUpdates(walletId, peak);
      const triggerMark = peak * (1 - (1 + i * 0.01) / 100);

      await executionRouter.dispatch(engine, {
        type: "TRIGGER_TRAILING_STOP",
        domain: "PERP",
        walletId,
        trailingStopId: (await trailingStopRuntime.listActive(walletId))[0]!.id,
        marketPrice: triggerMark,
      });

      const state = await engine.getState(triggerMark);
      expect(state.positions[0]?.quantity ?? 0).toBe(0);
      expect(state.trades.every((t) => !t.reduceOnly || t.side === "SELL")).toBe(true);
      expect(await trailingStopRuntime.listActive(walletId)).toHaveLength(0);
    }
  });
});
