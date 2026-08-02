import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { loadPortfolioReadModel } from "@/lib/cartera/read/portfolioReadModelService";
import type { PortfolioReadModel } from "@/lib/cartera/read/types";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { marketTickStore } from "@/lib/market/MarketTickStore";

export type PortfolioReadContextValue = {
  wealth: PortfolioReadModel | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

const PortfolioBoundaryContext = createContext<PortfolioReadContextValue | null>(null);

type PortfolioContextProviderProps = {
  children: ReactNode;
};

/**
 * READ-ONLY context — analytics and aggregation only.
 * Loads on refresh / first mark — not on every tick.
 */
export function PortfolioContextProvider({ children }: PortfolioContextProviderProps) {
  const [wealth, setWealth] = useState<PortfolioReadModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const wealthRef = useRef<PortfolioReadModel | null>(null);

  wealthRef.current = wealth;

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let loaded = false;
    const isInitialLoad = wealthRef.current === null;

    if (isInitialLoad) {
      setIsLoading(true);
      setError(null);
    }

    const load = (price: number) => {
      void loadPortfolioReadModel(price)
        .then((next) => {
          if (!active) return;
          setWealth(next);
          setError(null);
          loaded = true;
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (wealthRef.current === null) {
            setWealth(null);
            setError(err instanceof Error ? err.message : "No se pudo consolidar el patrimonio");
          }
        })
        .finally(() => {
          if (active && isInitialLoad) {
            setIsLoading(false);
          }
        });
    };

    const tryLoad = () => {
      const price = marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL);
      if (price == null) {
        if (wealthRef.current === null) {
          setWealth(null);
          setIsLoading(false);
        }
        return;
      }
      load(price);
    };

    tryLoad();

    const unsub = marketTickStore.subscribe(() => {
      if (loaded) return;
      tryLoad();
    });

    return () => {
      active = false;
      unsub();
    };
  }, [refreshKey]);

  const value = useMemo<PortfolioReadContextValue>(
    () => ({
      wealth,
      isLoading,
      error,
      refresh,
    }),
    [error, isLoading, refresh, wealth],
  );

  return (
    <PortfolioBoundaryContext.Provider value={value}>{children}</PortfolioBoundaryContext.Provider>
  );
}

export function usePortfolioReadContext(): PortfolioReadContextValue {
  const ctx = useContext(PortfolioBoundaryContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioReadContext must be used within PortfolioContextProvider (PORTFOLIO bounded context only)",
    );
  }
  return ctx;
}
