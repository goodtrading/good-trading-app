import { useCallback, useEffect, useRef, useState } from "react";

import { loadPortfolioReadModel } from "@/lib/cartera/read/portfolioReadModelService";
import type { PortfolioReadModel } from "@/lib/cartera/read/types";

type ConsolidatedWealthState = {
  wealth: PortfolioReadModel | null;
  /** True only during the first load while wealth is still null. */
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * @deprecated Use `usePortfolioReadContext()` inside PORTFOLIO bounded context.
 * Read-only — no TradingContext dependency.
 */
export function useConsolidatedWealth(marketPrice: number | null): ConsolidatedWealthState {
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

  return { wealth, isLoading, error, refresh };
}
