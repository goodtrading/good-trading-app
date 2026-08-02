import { useCallback, useEffect, useRef, useState } from "react";

import { useTradingMode } from "@/lib/cartera/context/TradingModeContext";
import {
  bootstrapPortfolioAccount,
  loadAccountsRegistry,
} from "@/lib/portfolio/accounts/portfolioAccountService";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  executionRouter,
  isSpotDispatchResult,
  toExecutionRequest,
} from "@/lib/portfolio/domain/ExecutionRouter";
import type { TradingDomain } from "@/lib/portfolio/domain/types/execution";
import { marketTickStore } from "@/lib/market/MarketTickStore";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  createOrderPriceEvaluator,
  type OrderPriceEvaluator,
} from "@/lib/portfolio/orderRegistry/OrderPriceEvaluator";
import { createSpotOrderEvaluator } from "@/lib/portfolio/spot/orders/SpotOrderEvaluator";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";
import { spotOrderToViewEntity } from "@/lib/portfolio/spot/spotOrderView";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { portfolioEngineRuntime } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";
import type { TradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { PortfolioEngineState } from "@/lib/portfolio/types";
import type { OcoGroupSnapshotEntry } from "@/lib/portfolio/oco/OcoGroup";
import type { TrailingStopSnapshotEntry } from "@/lib/portfolio/trailing/TrailingStop";
import { buildOpenOcoGroupSnapshots, ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import {
  buildOpenTrailingStopSnapshots,
  trailingStopRuntime,
} from "@/lib/portfolio/trailing/TrailingStopRuntime";
import { createTrailingStopPriceEvaluator } from "@/lib/portfolio/trailing/TrailingStopPriceEvaluator";

type UsePortfolioAccountSessionResult = {
  account: PortfolioAccount | null;
  accounts: PortfolioAccount[];
  state: PortfolioEngineState | null;
  openOrders: OrderEntity[];
  openOcoGroups: OcoGroupSnapshotEntry[];
  openTrailingStops: TrailingStopSnapshotEntry[];
  isBootstrapping: boolean;
  isEngineLoading: boolean;
  error: string | null;
  /** True when the trading service stack is ready for writes. */
  canTrade: boolean;
  walletId: string | null;
  refresh: () => void;
  createAccount: (name: string, initialBalance: number) => Promise<void>;
  /** All writes go through ExecutionRouter. */
  executeTrade: (request: TradeExecutionRequest) => Promise<void>;
  buy: (quantity: number, price: number) => Promise<void>;
  sell: (quantity: number, price: number) => Promise<void>;
  closePosition: (symbol: string) => Promise<void>;
  updatePositionTpSl: (
    symbol: string,
    takeProfitPrice: number | null,
    stopLossPrice: number | null,
  ) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
};

export function usePortfolioAccountSession(
  accountId: string | null,
): UsePortfolioAccountSessionResult {
  const { mode } = useTradingMode();
  const domain: TradingDomain = mode;

  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [account, setAccount] = useState<PortfolioAccount | null>(null);
  const [engine, setEngine] = useState<PortfolioEngine | null>(null);
  const [state, setState] = useState<PortfolioEngineState | null>(null);
  const [openOrders, setOpenOrders] = useState<OrderEntity[]>([]);
  const [openOcoGroups, setOpenOcoGroups] = useState<OcoGroupSnapshotEntry[]>([]);
  const [openTrailingStops, setOpenTrailingStops] = useState<TrailingStopSnapshotEntry[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isEngineLoading, setIsEngineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const marketPriceRef = useRef<number | null>(
    marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL),
  );

  useEffect(() => {
    const sync = () => {
      marketPriceRef.current = marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL);
      portfolioEngineRuntime.updatePrice(marketPriceRef.current);
    };
    sync();
    return marketTickStore.subscribe(sync);
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  /** Read-only registry access (not a write path). Domain-scoped. */
  const refreshOpenOrders = useCallback(
    async (walletId: string) => {
      if (domain === "SPOT") {
        const orders = spotLedgerStore.getOpenOrders(walletId);
        setOpenOrders(orders.map(spotOrderToViewEntity));
        setOpenOcoGroups([]);
        setOpenTrailingStops([]);
        return;
      }
      const [orders, activeGroups, allOrders, activeTrailing] = await Promise.all([
        orderRegistryEngine.listOpen(walletId),
        ocoRuntime.listActive(walletId),
        orderRegistryEngine.list(walletId),
        trailingStopRuntime.listActive(walletId),
      ]);
      setOpenOrders(orders);
      setOpenOcoGroups(buildOpenOcoGroupSnapshots(activeGroups, allOrders));
      setOpenTrailingStops(buildOpenTrailingStopSnapshots(activeTrailing));
    },
    [domain],
  );

  useEffect(() => {
    let active = true;

    setIsBootstrapping(true);
    setError(null);

    void (async () => {
      try {
        const registry = await loadAccountsRegistry();
        if (!active) return;
        setAccounts(registry.accounts);

        if (!accountId) {
          setAccount(null);
          setEngine(null);
          setState(null);
          setOpenOrders([]);
          setOpenOcoGroups([]);
          return;
        }

        const resolved = registry.accounts.find((entry) => entry.id === accountId) ?? null;
        setAccount(resolved);
        if (!resolved) {
          setError("Cuenta Paper no encontrada");
          setEngine(null);
          setState(null);
          setOpenOrders([]);
          setOpenOcoGroups([]);
        }
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No se pudieron cargar las cuentas");
      } finally {
        if (active) setIsBootstrapping(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accountId, refreshKey]);

  useEffect(() => {
    if (!accountId || !account) {
      setEngine(null);
      setState(null);
      setOpenOrders([]);
      setOpenOcoGroups([]);
      return;
    }

    let active = true;
    setIsEngineLoading(true);
    setError(null);

    void (async () => {
      try {
        const startPrice = marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL);
        const nextEngine = await portfolioEngineRuntime.start(accountId, {
          marketPrice: startPrice,
        });
        if (!active) return;

        portfolioEngineRuntime.updatePrice(startPrice);
        setEngine(nextEngine);
        await refreshOpenOrders(accountId);

        if (startPrice == null) {
          setState(null);
          return;
        }

        const nextState = await nextEngine.getState(startPrice);
        if (!active) return;
        setState(nextState);
      } catch (err: unknown) {
        if (!active) return;
        setEngine(null);
        setState(null);
        setError(err instanceof Error ? err.message : "No se pudo cargar la cartera");
      } finally {
        if (active) setIsEngineLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [account, accountId, refreshKey, refreshOpenOrders]);

  /** Load portfolio state once when mark first becomes available (not on every tick). */
  useEffect(() => {
    if (!engine || !accountId) return;

    let loadedWithPrice = marketPriceRef.current != null;

    const tryLoad = async () => {
      const price = marketPriceRef.current;
      if (price == null) return;
      const nextState = await engine.getState(price);
      setState(nextState);
      loadedWithPrice = true;
    };

    if (!loadedWithPrice) {
      void tryLoad();
    }

    return marketTickStore.subscribe(() => {
      if (loadedWithPrice || marketPriceRef.current == null) return;
      void tryLoad();
    });
  }, [accountId, engine]);

  // PERP limit/TP/SL evaluator
  useEffect(() => {
    if (domain !== "PERP" || !accountId || !engine) return;

    const evaluator: OrderPriceEvaluator = createOrderPriceEvaluator({
      walletId: accountId,
      getEngine: () => portfolioEngineRuntime.getEngineIfStarted(accountId),
      getPrice: () => marketPriceRef.current,
      onOrdersChanged: () => {
        void refreshOpenOrders(accountId);
        refresh();
      },
    });

    const trailingEvaluator = createTrailingStopPriceEvaluator({
      walletId: accountId,
      getEngine: () => portfolioEngineRuntime.getEngineIfStarted(accountId),
      getPrice: () => marketPriceRef.current,
      onTrailingChanged: () => {
        void refreshOpenOrders(accountId);
        refresh();
      },
    });

    evaluator.start(1000);
    trailingEvaluator.start(1000);
    void refreshOpenOrders(accountId);

    return () => {
      evaluator.stop();
      trailingEvaluator.stop();
    };
  }, [accountId, domain, engine, refresh, refreshOpenOrders]);

  // SPOT LIMIT evaluator (SpotOrderRegistry only)
  useEffect(() => {
    if (domain !== "SPOT" || !accountId) return;

    const syncOrdersFromStore = () => {
      const orders = spotLedgerStore.getOpenOrders(accountId);
      setOpenOrders(orders.map(spotOrderToViewEntity));
    };

    const evaluator = createSpotOrderEvaluator({
      walletId: accountId,
      getPrice: () => marketPriceRef.current,
      onOrdersChanged: syncOrdersFromStore,
    });

    evaluator.start(1000);
    syncOrdersFromStore();

    const unsubStore = spotLedgerStore.subscribe(syncOrdersFromStore);

    return () => {
      evaluator.stop();
      unsubStore();
    };
  }, [accountId, domain]);

  const createAccount = useCallback(async (name: string, initialBalance: number) => {
    const created = await bootstrapPortfolioAccount(name, initialBalance);
    setAccounts((current) => [...current, created]);
    setAccount(created);
    refresh();
  }, [refresh]);

  const buy = useCallback(
    async (quantity: number, price: number) => {
      const marketPrice = marketPriceRef.current;
      if (marketPrice == null || !accountId) return;
      // SPOT buy does not require PERP engine.
      if (domain === "PERP" && !engine) return;

      const next = await executionRouter.dispatch(engine, {
        type: "BUY",
        domain,
        walletId: accountId,
        quantity,
        price,
        marketPrice,
      });

      if (isSpotDispatchResult(next as never)) {
        await refreshOpenOrders(accountId);
        return;
      }

      setState(next as PortfolioEngineState);
      await refreshOpenOrders(accountId);
    },
    [accountId, domain, engine, refreshOpenOrders],
  );

  const sell = useCallback(
    async (quantity: number, price: number) => {
      const marketPrice = marketPriceRef.current;
      if (marketPrice == null || !accountId) return;
      if (domain === "PERP" && !engine) return;

      const next = await executionRouter.dispatch(engine, {
        type: "SELL",
        domain,
        walletId: accountId,
        quantity,
        price,
        marketPrice,
      });

      if (isSpotDispatchResult(next as never)) {
        await refreshOpenOrders(accountId);
        return;
      }

      setState(next as PortfolioEngineState);
      await refreshOpenOrders(accountId);
    },
    [accountId, domain, engine, refreshOpenOrders],
  );

  const closePosition = useCallback(
    async (symbol: string) => {
      const marketPrice = marketPriceRef.current;
      if (marketPrice == null || !accountId) {
        throw new Error("Motor de trading no disponible");
      }
      if (domain === "PERP" && !engine) {
        throw new Error("Motor de trading no disponible");
      }

      const result = (await executionRouter.dispatch(engine, {
        type: "CLOSE_POSITION",
        domain,
        walletId: accountId,
        symbol,
        marketPrice,
      })) as
        | { state: PortfolioEngineState | null }
        | import("@/lib/portfolio/domain/ExecutionRouter").SpotDispatchResult;

      if (isSpotDispatchResult(result as never)) {
        await refreshOpenOrders(accountId);
        return;
      }

      const perpResult = result as { state: PortfolioEngineState | null };
      if (perpResult.state) {
        setState(perpResult.state);
      }
      await refreshOpenOrders(accountId);
    },
    [accountId, domain, engine, refreshOpenOrders],
  );

  const updatePositionTpSl = useCallback(
    async (
      symbol: string,
      takeProfitPrice: number | null,
      stopLossPrice: number | null,
    ) => {
      const marketPrice = marketPriceRef.current;
      if (marketPrice == null || !accountId) {
        throw new Error("Motor de trading no disponible");
      }
      if (domain === "PERP" && !engine) {
        throw new Error("Motor de trading no disponible");
      }

      await executionRouter.dispatch(engine, {
        type: "UPDATE_POSITION_TPSL",
        domain,
        walletId: accountId,
        symbol,
        marketPrice,
        takeProfitPrice,
        stopLossPrice,
      });

      await refreshOpenOrders(accountId);
    },
    [accountId, domain, engine, refreshOpenOrders],
  );

  const executeTrade = useCallback(
    async (request: TradeExecutionRequest) => {
      if (request.domain === "PERP" && !engine) {
        throw new Error("Motor de trading no disponible");
      }

      const result = await executionRouter.execute(
        engine,
        toExecutionRequest(request),
      );

      // SPOT writes SpotLedger only — never mutates PERP portfolio state.
      if (isSpotDispatchResult(result)) {
        if (accountId) {
          await refreshOpenOrders(accountId);
        }
        return;
      }

      if ("pending" in result && result.pending) {
        if (accountId) {
          await refreshOpenOrders(accountId);
        }
        return;
      }

      setState(result);
      if (accountId) {
        await refreshOpenOrders(accountId);
      }
    },
    [accountId, engine, refreshOpenOrders],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!accountId) return;
      if (domain === "PERP" && !engine) return;
      await executionRouter.dispatch(engine, {
        type: "CANCEL_ORDER",
        domain,
        walletId: accountId,
        orderId,
      });
      await refreshOpenOrders(accountId);
    },
    [accountId, domain, engine, refreshOpenOrders],
  );

  return {
    account,
    accounts,
    state,
    openOrders,
    openOcoGroups,
    openTrailingStops,
    isBootstrapping,
    isEngineLoading,
    error,
    canTrade: domain === "SPOT" ? accountId != null : engine != null,
    walletId: accountId,
    refresh,
    createAccount,
    executeTrade,
    buy,
    sell,
    closePosition,
    updatePositionTpSl,
    cancelOrder,
  };
}
