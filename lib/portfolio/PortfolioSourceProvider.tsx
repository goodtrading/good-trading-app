import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { MAX_PAPER_ACCOUNTS } from "@/lib/portfolio/accounts/constants";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";
import {
  bootstrapPortfolioAccount,
  loadAccountsRegistry,
} from "@/lib/portfolio/accounts/portfolioAccountService";
import { setActivePortfolioAccount, deletePortfolioAccount } from "@/lib/portfolio/accounts/accountStorage";
import { loadExchangeConnections } from "@/lib/portfolio/exchanges/exchangeConnectionStorage";
import { portfolioProviderRegistry } from "./registry";
import { PORTFOLIO_SOURCE_CATALOG, VISIBLE_PORTFOLIO_SOURCE_IDS } from "./sourceCatalog";
import type {
  PortfolioProvider,
  PortfolioSelection,
  PortfolioSourceContextValue,
  PortfolioSourceId,
  PortfolioSourceMeta,
} from "./types";

const PortfolioSourceContext = createContext<PortfolioSourceContextValue | null>(null);

export function PortfolioSourceProvider({ children }: { children: ReactNode }) {
  const [paperAccounts, setPaperAccounts] = useState<PortfolioAccount[]>([]);
  const [exchangeConnections, setExchangeConnections] = useState({
    binance: false,
    bingx: false,
  });
  const [selection, setSelection] = useState<PortfolioSelection | null>(null);

  const refreshPortfolioView = useCallback(async () => {
    const [registry, connections] = await Promise.all([
      loadAccountsRegistry(),
      loadExchangeConnections(),
    ]);
    setPaperAccounts(registry.accounts);
    setExchangeConnections({
      binance: connections.binance.connected,
      bingx: connections.bingx.connected,
    });
    return registry;
  }, []);

  useEffect(() => {
    void (async () => {
      const registry = await refreshPortfolioView();
      if (registry.accounts.length > 0) {
        const accountId = registry.activeAccountId ?? registry.accounts[0].id;
        setSelection({ type: "paper", accountId });
        return;
      }

      const connections = await loadExchangeConnections();
      if (connections.binance.connected) {
        setSelection({ type: "exchange", sourceId: "binance" });
      } else if (connections.bingx.connected) {
        setSelection({ type: "exchange", sourceId: "bingx" });
      } else {
        setSelection({ type: "paper", accountId: "" });
      }
    })();
  }, [refreshPortfolioView]);

  const selectPaperAccount = useCallback(
    async (accountId: string) => {
      await setActivePortfolioAccount(accountId);
      setSelection({ type: "paper", accountId });
      await refreshPortfolioView();
    },
    [refreshPortfolioView],
  );

  const selectExchange = useCallback((sourceId: "binance" | "bingx") => {
    setSelection({ type: "exchange", sourceId });
  }, []);

  const createPaperAccount = useCallback(
    async (name: string, initialBalance: number) => {
      const account = await bootstrapPortfolioAccount(name, initialBalance);
      await refreshPortfolioView();
      setSelection({ type: "paper", accountId: account.id });
      return account;
    },
    [refreshPortfolioView],
  );

  const deletePaperAccount = useCallback(
    async (accountId: string) => {
      const nextRegistry = await deletePortfolioAccount(accountId);
      await refreshPortfolioView();
      const nextActiveId = nextRegistry.activeAccountId ?? nextRegistry.accounts[0]?.id ?? "";
      setSelection({ type: "paper", accountId: nextActiveId });
    },
    [refreshPortfolioView],
  );

  const setSelectedSource = useCallback(
    (source: PortfolioSourceId) => {
      if (source === "paper") {
        const accountId = paperAccounts[0]?.id ?? "";
        setSelection({ type: "paper", accountId });
        if (accountId) {
          void setActivePortfolioAccount(accountId);
        }
        return;
      }
      if (source === "binance" || source === "bingx") {
        setSelection({ type: "exchange", sourceId: source });
      }
    },
    [paperAccounts],
  );

  const getProvider = useCallback(
    (id: PortfolioSourceId): PortfolioProvider | undefined => portfolioProviderRegistry.get(id),
    [],
  );

  const visibleSources = useMemo((): PortfolioSourceMeta[] => {
    const exchangeSources = VISIBLE_PORTFOLIO_SOURCE_IDS.filter((id) => {
      if (id === "paper") return false;
      if (id === "binance") return exchangeConnections.binance;
      if (id === "bingx") return exchangeConnections.bingx;
      return PORTFOLIO_SOURCE_CATALOG[id].isVisible;
    }).map((id) => PORTFOLIO_SOURCE_CATALOG[id]);

    return exchangeSources;
  }, [exchangeConnections.binance, exchangeConnections.bingx]);

  const selectedSource: PortfolioSourceId = useMemo(() => {
    if (selection?.type === "exchange") return selection.sourceId;
    return "paper";
  }, [selection]);

  const isPaperView = selection?.type === "paper";
  const selectedPaperAccountId =
    selection?.type === "paper" && selection.accountId ? selection.accountId : null;
  const canCreatePaperAccount = paperAccounts.length < MAX_PAPER_ACCOUNTS;

  const value = useMemo<PortfolioSourceContextValue>(
    () => ({
      selectedSource,
      setSelectedSource,
      visibleSources,
      getProvider,
      selection,
      paperAccounts,
      exchangeConnections,
      selectPaperAccount,
      selectExchange,
      createPaperAccount,
      deletePaperAccount,
      refreshPortfolioView,
      canCreatePaperAccount,
      isPaperView,
      selectedPaperAccountId,
    }),
    [
      canCreatePaperAccount,
      createPaperAccount,
      deletePaperAccount,
      exchangeConnections,
      getProvider,
      isPaperView,
      paperAccounts,
      refreshPortfolioView,
      selectExchange,
      selectPaperAccount,
      selectedPaperAccountId,
      selectedSource,
      selection,
      setSelectedSource,
      visibleSources,
    ],
  );

  return (
    <PortfolioSourceContext.Provider value={value}>{children}</PortfolioSourceContext.Provider>
  );
}

/**
 * @deprecated Prefer `useTradingContext()` from `@/lib/cartera` inside TRADING bounded context.
 * PortfolioSourceProvider is scoped to TradingContextProvider — not app-global.
 */
export function usePortfolioSource(): PortfolioSourceContextValue {
  const ctx = useContext(PortfolioSourceContext);
  if (!ctx) {
    throw new Error("usePortfolioSource must be used within PortfolioSourceProvider");
  }
  return ctx;
}
