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
import { buildPerpWalletInline } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import { openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  assertReduceOnlyExecution,
  clampReduceOnlyQuantity,
  canExecuteReduceOnly,
  ReduceOnlyValidationError,
  validateReduceOnly,
  wouldIncreaseExposure,
} from "@/lib/portfolio/reduceOnly/ReduceOnlyValidator";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import { accumulatePositionFromTrades } from "@/lib/portfolio/positionEngine";
import {
  createFundingScheduler,
  type FundingClock,
} from "@/lib/portfolio/funding/FundingScheduler";

const MARK = 50_000;

class TestClock implements FundingClock {
  constructor(private ms: number) {}
  now(): number {
    return this.ms;
  }
  advance(by: number): void {
    this.ms += by;
  }
}

async function setupEngine(walletId: string, balance = 500_000) {
  const storage = createPortfolioStorageForAccount(walletId);
  await commitGenesisLedger(storage, balance);
  const engine = createPortfolioEngine(storage, new PaperBroker());
  return { storage, engine, walletId };
}

function openLong(
  engine: ReturnType<typeof createPortfolioEngine>,
  walletId: string,
  quantity: number,
  price = MARK,
) {
  return executeTradeRequest(
    engine,
    buildTradeExecutionRequest({
      walletId,
      direction: "LONG",
      orderType: "MARKET",
      marginMode: "CROSS",
      leverage: 1,
      quantity,
      margin: quantity * price,
      price,
      marketPrice: price,
      tpSlEnabled: false,
      reduceOnlyEnabled: false,
    }),
  );
}

function reduceOnlyClose(
  engine: ReturnType<typeof createPortfolioEngine>,
  walletId: string,
  quantity: number,
  direction: "LONG" | "SHORT",
  price = MARK,
) {
  return executeTradeRequest(
    engine,
    buildTradeExecutionRequest({
      walletId,
      direction,
      orderType: "MARKET",
      marginMode: "CROSS",
      leverage: 1,
      quantity,
      margin: quantity * price,
      price,
      marketPrice: price,
      tpSlEnabled: false,
      reduceOnlyEnabled: true,
    }),
  );
}

describe("ReduceOnlyValidator (FASE 12.3)", () => {
  describe("pure validation", () => {
    it("allows partial reduce on long via SELL", () => {
      const result = validateReduceOnly({
        positionQuantity: 2,
        side: "SELL",
        requestedQuantity: 1,
      });
      expect(result.allowed).toBe(true);
      expect(result.executableQuantity).toBe(1);
    });

    it("allows full close on long", () => {
      const result = validateReduceOnly({
        positionQuantity: 2,
        side: "SELL",
        requestedQuantity: 2,
      });
      expect(result.executableQuantity).toBe(2);
    });

    it("CLAMP mode executes only max reducible when quantity exceeds position", () => {
      const result = validateReduceOnly({
        positionQuantity: 2,
        side: "SELL",
        requestedQuantity: 3,
      });
      expect(result.allowed).toBe(true);
      expect(result.executableQuantity).toBe(2);
      expect(clampReduceOnlyQuantity(2, "SELL", 3)).toBe(2);
      expect(wouldIncreaseExposure(2, "SELL", 3)).toBe(true);
    });

    it("REJECT mode rejects when quantity exceeds position", () => {
      const result = validateReduceOnly({
        positionQuantity: 2,
        side: "SELL",
        requestedQuantity: 3,
        policy: { mode: "REJECT" },
      });
      expect(result.allowed).toBe(false);
      expect(result.executableQuantity).toBe(0);
      expect(() =>
        assertReduceOnlyExecution({
          positionQuantity: 2,
          side: "SELL",
          requestedQuantity: 3,
          policy: { mode: "REJECT" },
        }),
      ).toThrow(ReduceOnlyValidationError);
    });

    it("rejects reduce-only without position", () => {
      expect(canExecuteReduceOnly(0, "SELL", 1)).toBe(false);
      expect(validateReduceOnly({ positionQuantity: 0, side: "SELL", requestedQuantity: 1 }).allowed).toBe(
        false,
      );
    });

    it("rejects wrong side on long (BUY would increase exposure)", () => {
      const result = validateReduceOnly({
        positionQuantity: 2,
        side: "BUY",
        requestedQuantity: 1,
      });
      expect(result.allowed).toBe(false);
      expect(wouldIncreaseExposure(2, "BUY", 1)).toBe(true);
    });

    it("blocks flip on short via excess BUY", () => {
      expect(wouldIncreaseExposure(-5, "BUY", 8)).toBe(true);
      expect(
        validateReduceOnly({ positionQuantity: -5, side: "BUY", requestedQuantity: 8 }).executableQuantity,
      ).toBe(5);
    });

    it("allows reduce on short via BUY", () => {
      expect(
        validateReduceOnly({ positionQuantity: -5, side: "BUY", requestedQuantity: 2 }).executableQuantity,
      ).toBe(2);
    });
  });

  describe("execution pipeline", () => {
    beforeEach(() => {
      memoryStore.clear();
    });

    afterEach(() => {
      memoryStore.clear();
    });

    it("partial reduce preserves remaining long", async () => {
      const { engine, walletId } = await setupEngine("ro_partial");
      await openLong(engine, walletId, 2);
      await reduceOnlyClose(engine, walletId, 1, "SHORT");

      const state = await engine.getState(MARK);
      expect(state.positions[0]?.quantity).toBe(1);
      expect(state.trades[1]?.reduceOnly).toBe(true);
    });

    it("clamp closes long without opening short", async () => {
      const { engine, walletId } = await setupEngine("ro_clamp");
      await openLong(engine, walletId, 2);
      await reduceOnlyClose(engine, walletId, 3, "SHORT");

      const state = await engine.getState(MARK);
      expect(state.positions).toHaveLength(0);
      expect(state.trades[1]?.quantity).toBe(2);
      expect(state.trades[1]?.reduceOnly).toBe(true);
    });

    it("rejects reduce-only open without position", async () => {
      const { engine, walletId } = await setupEngine("ro_no_pos");
      await expect(reduceOnlyClose(engine, walletId, 1, "SHORT")).rejects.toThrow(
        ReduceOnlyValidationError,
      );
    });

    it("rejects wrong-side reduce-only on long", async () => {
      const { engine, walletId } = await setupEngine("ro_wrong_side");
      await openLong(engine, walletId, 2);
      await expect(reduceOnlyClose(engine, walletId, 1, "LONG")).rejects.toThrow(
        ReduceOnlyValidationError,
      );
    });

    it("short reduce via BUY never opens long", async () => {
      const { engine, walletId } = await setupEngine("ro_short");
      engine.setPositionMode("LONG_SHORT");
      await engine.sell(5, MARK, MARK);
      await reduceOnlyClose(engine, walletId, 8, "LONG");

      const state = await engine.getState(MARK);
      expect(state.positions).toHaveLength(0);
      expect(state.trades[1]?.quantity).toBe(5);
    });

    it("persists reduceOnly on trade and survives reload", async () => {
      const { engine, walletId, storage } = await setupEngine("ro_reload");
      await openLong(engine, walletId, 1);
      await reduceOnlyClose(engine, walletId, 1, "SHORT");

      const persisted = await storage.load();
      expect(persisted.trades.some((t) => t.reduceOnly === true)).toBe(true);

      const reloaded = createPortfolioEngine(storage, new PaperBroker());
      const state = await reloaded.restoreState({
        initialCashBalance: persisted.initialCashBalance,
        walletCash: persisted.walletCash,
        trades: persisted.trades,
        marketPrice: MARK,
      });
      expect(state.trades.some((t) => t.reduceOnly === true)).toBe(true);
      expect(state.positions).toHaveLength(0);
    });

    it("history rows include reduceOnly flag", async () => {
      const { engine, walletId } = await setupEngine("ro_history");
      await openLong(engine, walletId, 1);
      await reduceOnlyClose(engine, walletId, 1, "SHORT");

      const state = await engine.getState(MARK);
      const history = buildTradeHistoryFromLedger(state.trades);
      const closeRow = history.find((row) => row.action === "CLOSE");
      expect(closeRow?.reduceOnly).toBe(true);
    });

    it("snapshot exposes canReduce and maxReducibleQuantity", async () => {
      const { engine, walletId, storage } = await setupEngine("ro_snapshot");
      await openLong(engine, walletId, 2);

      const persisted = await storage.load();
      const snapshot = derivePerpWalletMetrics({
        accountId: walletId,
        initialCashBalance: persisted.initialCashBalance,
        walletCash: persisted.walletCash ?? persisted.initialCashBalance,
        realizedPnL: accumulatePositionFromTrades(persisted.trades).realizedPnL,
        trades: persisted.trades,
        markPrice: MARK,
      }).snapshot;

      expect(snapshot.reduceOnlySupported).toBe(true);
      expect(snapshot.canReduce).toBe(true);
      expect(snapshot.maxReducibleQuantity).toBe(2);

      await reduceOnlyClose(engine, walletId, 2, "SHORT");
      const flat = await storage.load();
      const flatSnapshot = buildPerpWalletInline(walletId, flat, MARK);
      expect(flatSnapshot.canReduce).toBe(false);
      expect(flatSnapshot.maxReducibleQuantity).toBe(0);
    });

    it("fees apply to clamped reduce-only quantity only", async () => {
      const { engine, walletId } = await setupEngine("ro_fees");
      await openLong(engine, walletId, 2);
      await reduceOnlyClose(engine, walletId, 3, "SHORT");

      const state = await engine.getState(MARK);
      const closeTrade = state.trades[1]!;
      expect(closeTrade.quantity).toBe(2);
      expect(closeTrade.fees.totalFee).toBe(openFee(2, MARK));
    });

    it("funding remains compatible after reduce-only close", async () => {
      const { engine, walletId, storage } = await setupEngine("ro_funding");
      const clock = new TestClock(Date.now());

      await openLong(engine, walletId, 1);

      const scheduler = createFundingScheduler(
        engine,
        storage,
        { getLastPrice: () => MARK },
        { clock },
      );

      await scheduler.runFunding();
      await reduceOnlyClose(engine, walletId, 1, "SHORT");
      await scheduler.runFunding();

      const persisted = await storage.load();
      expect(persisted.financialEvents?.some((e) => e.type === "FUNDING")).toBe(true);
      expect(persisted.trades.some((t) => t.reduceOnly === true)).toBe(true);
    });

    it("position metrics unchanged by reduce-only flag (regression)", async () => {
      const { engine, walletId } = await setupEngine("ro_regression");
      await openLong(engine, walletId, 2, MARK);
      const before = await engine.getState(MARK);
      const entryBefore = before.positions[0]?.avgEntry;

      await reduceOnlyClose(engine, walletId, 1, "SHORT", 55_000);
      const after = await engine.getState(55_000);
      expect(after.positions[0]?.quantity).toBe(1);
      expect(after.positions[0]?.avgEntry).toBe(entryBefore);
      expect(after.portfolio.realizedPnL).toBeCloseTo(55_000 - MARK, 0);
    });

    it("registered reduce-only LIMIT order clamps quantity at register", async () => {
      const { engine, walletId } = await setupEngine("ro_limit");
      await openLong(engine, walletId, 2);

      const result = await executeTradeRequest(
        engine,
        buildTradeExecutionRequest({
          walletId,
          direction: "SHORT",
          orderType: "LIMIT",
          marginMode: "CROSS",
          leverage: 1,
          quantity: 5,
          margin: 5 * MARK,
          price: MARK,
          marketPrice: MARK,
          tpSlEnabled: false,
          reduceOnlyEnabled: true,
        }),
      );

      expect("orderId" in result).toBe(true);
      const order = await orderRegistryEngine.getById(walletId, (result as { orderId: string }).orderId);
      expect(order?.quantity).toBe(2);
      expect(order?.reduceOnly).toBe(true);
    });

    it("fillRegisteredOrderPerp honors reduce-only clamp", async () => {
      const { engine, walletId } = await setupEngine("ro_fill");
      await openLong(engine, walletId, 2);

      const order = await orderRegistryEngine.register({
        walletId,
        symbol: "BTCUSDT",
        side: "SELL",
        direction: "SHORT",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        triggerPrice: MARK,
        quantity: 5,
        margin: 5 * MARK,
        reduceOnly: true,
      });

      await executionRouter.dispatch(engine, {
        type: "FILL_REGISTERED_ORDER",
        domain: "PERP",
        walletId,
        order,
        marketPrice: MARK,
      });

      const state = await engine.getState(MARK);
      expect(state.positions).toHaveLength(0);
      expect(state.trades[1]?.quantity).toBe(2);
      expect(state.trades[1]?.reduceOnly).toBe(true);
    });
  });
});
