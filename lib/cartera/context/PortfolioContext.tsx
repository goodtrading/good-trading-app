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

import { loadPortfolioReadModel, PortfolioReadModelService } from "@/lib/cartera/read/portfolioReadModelService";
import type { PortfolioReadModel } from "@/lib/cartera/read/types";

export type PortfolioReadContextValue = {
  wealth: PortfolioReadModel | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

const PortfolioBoundaryContext = createContext<PortfolioReadContextValue | null>(null);

type PortfolioContextProviderProps = {
  children: ReactNode;
  marketPrice: number | null;
};

/**
 * READ-ONLY context — analytics and aggregation only.
 * Exposes no write APIs. Loads via domain read service.
 */
export function PortfolioContextProvider({ children, marketPrice }: PortfolioContextProviderProps) {
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
    if (marketPrice == null) {
      setWealth(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const isInitialLoad = wealthRef.current === null;

    if (isInitialLoad) {
      setIsLoading(true);
      setError(null);
    }

    void loadPortfolioReadModel(marketPrice)
      .then((next) => {
        if (!active) return;
        setWealth(next);
        setError(null);
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

    return () => {
      active = false;
    };
  }, [marketPrice, refreshKey]);

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
