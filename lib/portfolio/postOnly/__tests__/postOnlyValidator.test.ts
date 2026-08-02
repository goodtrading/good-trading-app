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
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildTradeHistoryFromLedger } from "@/lib/portfolio/history/tradeHistoryFromLedger";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  assertPostOnly,
  canRegisterPostOnly,
  PostOnlyValidationError,
  validatePostOnly,
  wouldTakeLiquidity,
} from "@/lib/portfolio/postOnly/PostOnlyValidator";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { accumulatePositionFromTrades } from "@/lib/portfolio/positionEngine";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";

const MARK = 50_000;

async function setupEngine(walletId: string, balance = 500_000) {
  const storage = createPortfolioStorageForAccount(walletId);
  await commitGenesisLedger(storage, balance);
  const engine = createPortfolioEngine(storage, new PaperBroker());
  return { storage, engine, walletId };
}

function limitRequest(
  walletId: string,
  overrides: Partial<Parameters<typeof buildTradeExecutionRequest>[0]> = {},
) {
  return buildTradeExecutionRequest({
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
    ...overrides,
  });
}

describe("PostOnlyValidator (FASE 12.4)", () => {
  describe("pure validation", () => {
    it("rejects BUY when limit crosses mark", () => {
      expect(wouldTakeLiquidity("BUY", MARK, MARK)).toBe(true);
      expect(wouldTakeLiquidity("BUY", MARK + 100, MARK)).toBe(true);
      expect(canRegisterPostOnly("BUY", MARK, MARK)).toBe(false);
      expect(validatePostOnly({
        side: "BUY",
        limitPrice: MARK,
        markPrice: MARK,
        orderType: "LIMIT",
      }).allowed).toBe(false);
    });

    it("accepts BUY below mark", () => {
      expect(canRegisterPostOnly("BUY", 49_000, MARK)).toBe(true);
      expect(assertPostOnly({
        side: "BUY",
        limitPrice: 49_000,
        markPrice: MARK,
        orderType: "LIMIT",
      })).toBe("MAKER");
    });

    it("rejects SELL when limit crosses mark", () => {
      expect(wouldTakeLiquidity("SELL", MARK, MARK)).toBe(true);
      expect(wouldTakeLiquidity("SELL", 49_000, MARK)).toBe(true);
      expect(validatePostOnly({
        side: "SELL",
        limitPrice: 49_000,
        markPrice: MARK,
        orderType: "LIMIT",
      }).allowed).toBe(false);
    });

    it("accepts SELL above mark", () => {
      expect(canRegisterPostOnly("SELL", 51_000, MARK)).toBe(true);
      expect(assertPostOnly({
        side: "SELL",
        limitPrice: 51_000,
        markPrice: MARK,
        orderType: "LIMIT",
      })).toBe("MAKER");
    });

    it("rejects MARKET post-only", () => {
      expect(() =>
        assertPostOnly({
          side: "BUY",
          limitPrice: 49_000,
          markPrice: MARK,
          orderType: "MARKET",
        }),
      ).toThrow(PostOnlyValidationError);
    });
  });

  describe("execution pipeline", () => {
    beforeEach(() => {
      memoryStore.clear();
    });

    afterEach(() => {
      memoryStore.clear();
    });

    it("registers accepted post-only LIMIT without trades", async () => {
      const { engine, walletId, storage } = await setupEngine("po_accept");
      const before = await storage.load();

      const result = await executeTradeRequest(engine, limitRequest(walletId));

      expect("orderId" in result).toBe(true);
      const after = await storage.load();
      expect(after.trades).toHaveLength(before.trades.length);

      const order = await orderRegistryEngine.getById(
        walletId,
        (result as { orderId: string }).orderId,
      );
      expect(order?.postOnly).toBe(true);
      expect(order?.executionLiquidity).toBe("MAKER");
    });

    it("rejects crossing BUY without creating order", async () => {
      const { engine, walletId } = await setupEngine("po_reject_buy");

      await expect(
        executeTradeRequest(
          engine,
          limitRequest(walletId, { direction: "LONG", price: MARK }),
        ),
      ).rejects.toThrow(PostOnlyValidationError);

      expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    });

    it("rejects crossing SELL without creating order", async () => {
      const { engine, walletId } = await setupEngine("po_reject_sell");

      await expect(
        executeTradeRequest(
          engine,
          limitRequest(walletId, {
            direction: "SHORT",
            price: 49_000,
          }),
        ),
      ).rejects.toThrow(PostOnlyValidationError);

      expect(await orderRegistryEngine.listOpen(walletId)).toHaveLength(0);
    });

    it("supports Reduce Only + Post Only together", async () => {
      const { engine, walletId } = await setupEngine("po_ro_combo");
      await executeTradeRequest(
        engine,
        buildTradeExecutionRequest({
          walletId,
          direction: "LONG",
          orderType: "MARKET",
          marginMode: "CROSS",
          leverage: 1,
          quantity: 2,
          margin: 2 * MARK,
          price: MARK,
          marketPrice: MARK,
          tpSlEnabled: false,
          reduceOnlyEnabled: false,
          postOnlyEnabled: false,
        }),
      );

      const result = await executeTradeRequest(
        engine,
        limitRequest(walletId, {
          direction: "SHORT",
          price: 51_000,
          reduceOnlyEnabled: true,
          quantity: 1,
        }),
      );

      const order = await orderRegistryEngine.getById(
        walletId,
        (result as { orderId: string }).orderId,
      );
      expect(order?.reduceOnly).toBe(true);
      expect(order?.postOnly).toBe(true);
      expect(order?.quantity).toBe(1);
    });

    it("fill tags trade as MAKER and postOnly", async () => {
      const { engine, walletId } = await setupEngine("po_maker_tag");
      const order = await orderRegistryEngine.register({
        walletId,
        symbol: "BTCUSDT",
        side: "BUY",
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        triggerPrice: 49_000,
        quantity: 1,
        margin: MARK,
        postOnly: true,
        executionLiquidity: "MAKER",
      });

      await executionRouter.dispatch(engine, {
        type: "FILL_REGISTERED_ORDER",
        domain: "PERP",
        walletId,
        order,
        marketPrice: 49_000,
      });

      const state = await engine.getState(49_000);
      expect(state.trades[0]?.postOnly).toBe(true);
      expect(state.trades[0]?.executionLiquidity).toBe("MAKER");
    });

    it("persists flags and survives reload", async () => {
      const { engine, walletId, storage } = await setupEngine("po_reload");
      const order = await orderRegistryEngine.register({
        walletId,
        symbol: "BTCUSDT",
        side: "SELL",
        direction: "SHORT",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        triggerPrice: 51_000,
        quantity: 1,
        margin: MARK,
        postOnly: true,
        executionLiquidity: "MAKER",
      });

      await executionRouter.dispatch(engine, {
        type: "FILL_REGISTERED_ORDER",
        domain: "PERP",
        walletId,
        order,
        marketPrice: 51_000,
      });

      const persisted = await storage.load();
      expect(persisted.trades[0]?.executionLiquidity).toBe("MAKER");

      const reloaded = createPortfolioEngine(storage, new PaperBroker());
      const state = await reloaded.restoreState({
        initialCashBalance: persisted.initialCashBalance,
        walletCash: persisted.walletCash,
        trades: persisted.trades,
        marketPrice: 51_000,
      });
      expect(state.trades[0]?.postOnly).toBe(true);
    });

    it("history includes postOnly and executionLiquidity", async () => {
      const { engine, walletId } = await setupEngine("po_history");
      const order = await orderRegistryEngine.register({
        walletId,
        symbol: "BTCUSDT",
        side: "BUY",
        direction: "LONG",
        orderType: "LIMIT",
        marginMode: "CROSS",
        leverage: 1,
        triggerPrice: 49_000,
        quantity: 1,
        margin: MARK,
        postOnly: true,
        executionLiquidity: "MAKER",
      });

      await executionRouter.dispatch(engine, {
        type: "FILL_REGISTERED_ORDER",
        domain: "PERP",
        walletId,
        order,
        marketPrice: 49_000,
      });

      const state = await engine.getState(49_000);
      const row = buildTradeHistoryFromLedger(state.trades)[0];
      expect(row?.postOnly).toBe(true);
      expect(row?.executionLiquidity).toBe("MAKER");
    });

    it("snapshot exposes postOnlySupported and makerEligible", async () => {
      const { walletId, storage } = await setupEngine("po_snapshot");
      const persisted = await storage.load();
      const snapshot = derivePerpWalletMetrics({
        accountId: walletId,
        initialCashBalance: persisted.initialCashBalance,
        walletCash: persisted.walletCash ?? persisted.initialCashBalance,
        realizedPnL: accumulatePositionFromTrades(persisted.trades).realizedPnL,
        trades: persisted.trades,
        markPrice: MARK,
      }).snapshot;

      expect(snapshot.postOnlySupported).toBe(true);
      expect(snapshot.makerEligible).toBe(true);

      const flat = buildPerpWalletInline(walletId, persisted, 0);
      expect(flat.makerEligible).toBe(false);
    });

    it("does not change wallet on rejected post-only", async () => {
      const { engine, walletId, storage } = await setupEngine("po_wallet");
      const before = await storage.load();

      await expect(
        executeTradeRequest(
          engine,
          limitRequest(walletId, { price: MARK }),
        ),
      ).rejects.toThrow(PostOnlyValidationError);

      const after = await storage.load();
      expect(after.walletCash).toBe(before.walletCash);
      expect(after.trades).toHaveLength(before.trades.length);
    });

    it("regression: accepted post-only does not alter position until fill", async () => {
      const { engine, walletId } = await setupEngine("po_regression");
      await executeTradeRequest(engine, limitRequest(walletId));

      const state = await engine.getState(MARK);
      expect(state.positions).toHaveLength(0);
      expect(state.portfolio.walletBalance).toBe(500_000);
    });
  });
});
