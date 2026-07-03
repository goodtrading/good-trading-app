import { useCallback, useEffect, useMemo, useState } from "react";

import { rejectLedgerMutation } from "@/lib/cartera/ledger/LedgerTransaction";

import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import {
  createEngineForAccountStorage,
  bootstrapPortfolioAccount,
  loadAccountsRegistry,
} from "@/lib/portfolio/accounts/portfolioAccountService";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";
import type { PortfolioEngineState } from "@/lib/portfolio/types";

type UsePortfolioAccountSessionResult = {
  account: PortfolioAccount | null;
  accounts: PortfolioAccount[];
  state: PortfolioEngineState | null;
  isBootstrapping: boolean;
  isEngineLoading: boolean;
  error: string | null;
  refresh: () => void;
  createAccount: (name: string, initialBalance: number) => Promise<void>;
  buy: (quantity: number, price: number) => Promise<void>;
  sell: (quantity: number, price: number) => Promise<void>;
  deletePosition: (symbol: string) => Promise<void>;
};

export function usePortfolioAccountSession(
  marketPrice: number | null,
  accountId: string | null,
): UsePortfolioAccountSessionResult {
  const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
  const [account, setAccount] = useState<PortfolioAccount | null>(null);
  const [state, setState] = useState<PortfolioEngineState | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isEngineLoading, setIsEngineLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const storage = useMemo(
    () => (account ? createPortfolioStorageForAccount(account.id) : null),
    [account?.id],
  );

  const engine = useMemo(
    () => (storage ? createEngineForAccountStorage(storage) : null),
    [storage],
  );

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

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
          return;
        }

        const resolved = registry.accounts.find((entry) => entry.id === accountId) ?? null;
        setAccount(resolved);
        if (!resolved) {
          setError("Cuenta Paper no encontrada");
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
    if (!engine || !account || marketPrice == null) {
      setState(null);
      return;
    }

    let active = true;
    setIsEngineLoading(true);
    setError(null);

    void engine
      .getState(marketPrice)
      .then((next) => {
        if (!active) return;
        setState(next);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState(null);
        setError(err instanceof Error ? err.message : "No se pudo cargar la cartera");
      })
      .finally(() => {
        if (active) setIsEngineLoading(false);
      });

    return () => {
      active = false;
    };
  }, [account, engine, marketPrice, refreshKey]);

  const createAccount = useCallback(async (name: string, initialBalance: number) => {
    const created = await bootstrapPortfolioAccount(name, initialBalance);
    setAccounts((current) => [...current, created]);
    setAccount(created);
    refresh();
  }, [refresh]);

  const buy = useCallback(
    async (quantity: number, price: number) => {
      if (!engine || marketPrice == null) return;
      const next = await engine.buy(quantity, price, marketPrice);
      setState(next);
    },
    [engine, marketPrice],
  );

  const sell = useCallback(
    async (quantity: number, price: number) => {
      if (!engine || marketPrice == null) return;
      const next = await engine.sell(quantity, price, marketPrice);
      setState(next);
    },
    [engine, marketPrice],
  );

  const deletePosition = useCallback(
    async (_symbol: string) => {
      rejectLedgerMutation("deletePosition");
    },
    [],
  );

  return {
    account,
    accounts,
    state,
    isBootstrapping,
    isEngineLoading,
    error,
    refresh,
    createAccount,
    buy,
    sell,
    deletePosition,
  };
}
