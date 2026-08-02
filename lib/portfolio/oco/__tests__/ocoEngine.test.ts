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
import { ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import { replacePositionTpSl } from "@/lib/portfolio/orderRegistry/syncPositionOrders";
import { WalletService } from "@/lib/portfolio/wallets/WalletService";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { buildPositionId } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import { createOrderPriceEvaluator } from "@/lib/portfolio/orderRegistry/OrderPriceEvaluator";
import { ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";

const MARK = 50_000;

async function setupEngine(walletId: string, balance = 500_000) {
  const storage = createPortfolioStorageForAccount(walletId);
  await commitGenesisLedger(storage, balance);
  const engine = createPortfolioEngine(storage, new PaperBroker());
  return { storage, engine, walletId };
}

async function openLongWithTpSl(
  engine: ReturnType<typeof createPortfolioEngine>,
  walletId: string,
  opts?: { tp?: number; sl?: number; quantity?: number },
) {
  await executeTradeRequest(
    engine,
    buildTradeExecutionRequest({
      walletId,
      direction: "LONG",
      orderType: "MARKET",
      marginMode: "CROSS",
      leverage: 1,
      quantity: opts?.quantity ?? 1,
      margin: (opts?.quantity ?? 1) * MARK,
      price: MARK,
      marketPrice: MARK,
      tpSlEnabled: true,
      reduceOnlyEnabled: false,
      takeProfitPrice: opts?.tp ?? 70_000,
      stopLossPrice: opts?.sl ?? 45_000,
    }),
  );
}

describe("OCO (FASE 12.7)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("creates OCO group when TP and SL are registered together", async () => {
    const { engine, walletId } = await setupEngine("oco_create");
    await openLongWithTpSl(engine, walletId);

    const groups = await ocoRuntime.listActive(walletId);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.positionSide).toBe("LONG");
    expect(groups[0]?.status).toBe("ACTIVE");

    const open = await orderRegistryEngine.listOpen(walletId);
    expect(open).toHaveLength(2);
    expect(open.every((o) => o.reduceOnly)).toBe(true);
    expect(open.every((o) => o.ocoGroupId === groups[0]?.id)).toBe(true);
  });

  it("does not create OCO group for a single TP or SL leg", async () => {
    const { engine, walletId } = await setupEngine("oco_single");
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
        takeProfitPrice: 70_000,
        stopLossPrice: null,
      }),
    );

    expect(await ocoRuntime.listActive(walletId)).toHaveLength(0);
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(1);
  });

  it("executes TP and cancels SL counterpart immediately", async () => {
    const { engine, walletId } = await setupEngine("oco_tp_fill");
    await openLongWithTpSl(engine, walletId);

    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 70_000,
    });
    await evaluator.tick();

    const state = await engine.getState(70_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);

    const closeTrade = state.trades.find((t) => t.side === "SELL");
    expect(closeTrade?.triggerReason).toBe("TAKE_PROFIT");
    expect(closeTrade?.reduceOnly).toBe(true);

    const groups = await ocoRuntime.list(walletId);
    expect(groups[0]?.status).toBe("COMPLETED");

    const all = await orderRegistryEngine.list(walletId);
    expect(all.map((o) => o.status).sort()).toEqual(["CANCELLED", "FILLED"]);
    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
  });

  it("executes SL and cancels TP counterpart", async () => {
    const { engine, walletId } = await setupEngine("oco_sl_fill");
    await openLongWithTpSl(engine, walletId);

    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 45_000,
    });
    await evaluator.tick();

    const state = await engine.getState(45_000);
    const closeTrade = state.trades.find((t) => t.side === "SELL");
    expect(closeTrade?.triggerReason).toBe("STOP_LOSS");

    expect((await ocoRuntime.list(walletId))[0]?.status).toBe("COMPLETED");
  });

  it("manual cancel cancels the OCO counterpart", async () => {
    const { engine, walletId } = await setupEngine("oco_manual_cancel");
    await openLongWithTpSl(engine, walletId);

    const open = await orderRegistryEngine.listOpen(walletId);
    const tp = open.find((o) => o.orderType === "TAKE_PROFIT_MARKET")!;

    await executionRouter.dispatch(engine, {
      type: "CANCEL_ORDER",
      domain: "PERP",
      walletId,
      orderId: tp.id,
    });

    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    expect((await ocoRuntime.list(walletId))[0]?.status).toBe("CANCELLED");
  });

  it("supports independent OCO groups for HEDGE LONG and SHORT legs", async () => {
    const { engine, walletId } = await setupEngine("oco_hedge_dual", 1_000_000);
    engine.setAccountPositionMode("HEDGE");

    await engine.buy(0.5, MARK, MARK);
    await engine.sell(0.3, MARK, MARK);

    const state = await engine.getState(MARK);
    const longLeg = state.positions.find((p) => p.side === "LONG")!;
    const shortLeg = state.positions.find((p) => p.side === "SHORT")!;

    await replacePositionTpSl({
      walletId,
      symbol: "BTCUSDT",
      marginMode: longLeg.marginMode,
      leverage: longLeg.leverage,
      quantity: longLeg.quantity,
      margin: longLeg.entryMargin,
      signedQuantity: longLeg.quantity,
      positionSide: "LONG",
      takeProfitPrice: 70_000,
      stopLossPrice: 45_000,
    });

    await replacePositionTpSl({
      walletId,
      symbol: "BTCUSDT",
      marginMode: shortLeg.marginMode,
      leverage: shortLeg.leverage,
      quantity: shortLeg.quantity,
      margin: shortLeg.entryMargin,
      signedQuantity: -shortLeg.quantity,
      positionSide: "SHORT",
      takeProfitPrice: 40_000,
      stopLossPrice: 55_000,
    });

    const groups = await ocoRuntime.listActive(walletId);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.positionSide))).toEqual(new Set(["LONG", "SHORT"]));

    const longPositionId = buildPositionId(walletId, "BTCUSDT", "LONG");
    const shortPositionId = buildPositionId(walletId, "BTCUSDT", "SHORT");
    expect(
      (await orderRegistryEngine.listOpenForPosition(walletId, longPositionId)).length,
    ).toBe(2);
    expect(
      (await orderRegistryEngine.listOpenForPosition(walletId, shortPositionId)).length,
    ).toBe(2);
  });

  it("cancels OCO when position leg is closed manually", async () => {
    const { engine, walletId } = await setupEngine("oco_position_close");
    await openLongWithTpSl(engine, walletId);
    expect(await ocoRuntime.listActive(walletId)).toHaveLength(1);

    await executionRouter.dispatch(engine, {
      type: "CLOSE_POSITION",
      domain: "PERP",
      walletId,
      symbol: "BTCUSDT",
      marketPrice: MARK,
    });

    expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    expect((await ocoRuntime.list(walletId))[0]?.status).toBe("CANCELLED");
  });

  it("persists and reloads OCO groups from storage", async () => {
    const walletId = "oco_persist";
    const { engine } = await setupEngine(walletId);
    await openLongWithTpSl(engine, walletId);

    const before = await ocoRuntime.listActive(walletId);
    expect(before).toHaveLength(1);

    const reloaded = await ocoRuntime.listActive(walletId);
    expect(reloaded[0]?.id).toBe(before[0]?.id);
    expect(reloaded[0]?.takeProfitOrderId).toBe(before[0]?.takeProfitOrderId);
  });

  it("exposes openOcoGroups in wallet snapshot", async () => {
    const { engine, walletId } = await setupEngine("oco_snapshot");
    await openLongWithTpSl(engine, walletId);

    const walletService = new WalletService();
    const snapshot = await walletService.getPerpWallet(walletId, MARK);
    expect(snapshot.openOcoGroups.length).toBeGreaterThan(0);
    expect(snapshot.openOcoGroups[0]?.side).toBe("LONG");
    expect(snapshot.openOcoGroups[0]?.takeProfit).not.toBeNull();
    expect(snapshot.openOcoGroups[0]?.stopLoss).not.toBeNull();
  });

  it("records triggerReason in trade history", async () => {
    const { engine, walletId } = await setupEngine("oco_history");
    await openLongWithTpSl(engine, walletId);

    const evaluator = createOrderPriceEvaluator({
      walletId,
      getEngine: () => engine,
      getPrice: () => 70_000,
    });
    await evaluator.tick();

    const state = await engine.getState(70_000);
    const history = buildTradeHistoryFromLedger(state.trades);
    const tpClose = history.find((row) => row.triggerReason === "TAKE_PROFIT");
    expect(tpClose).toBeDefined();
    expect(tpClose?.action).toBe("CLOSE");
  });

  it("stress: many sequential TP fills never double-execute siblings", async () => {
    for (let i = 0; i < 50; i++) {
      memoryStore.clear();
      const walletId = `oco_stress_${i}`;
      const { engine } = await setupEngine(walletId, 2_000_000);
      await openLongWithTpSl(engine, walletId, {
        tp: 60_000 + i * 100,
        sl: 40_000 - i * 50,
        quantity: 0.1,
      });

      const evaluator = createOrderPriceEvaluator({
        walletId,
        getEngine: () => engine,
        getPrice: () => 60_000 + i * 100,
      });
      await evaluator.tick();

      const filled = (await orderRegistryEngine.list(walletId)).filter((o) => o.status === "FILLED");
      expect(filled).toHaveLength(1);
      expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    }
  });
});
