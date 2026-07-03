import { useCallback, useEffect, useMemo, useState } from "react";

import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { getDefaultPortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioEngineState } from "@/lib/portfolio/types";

type UsePortfolioEngineResult = {
  state: PortfolioEngineState | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  buy: (quantity: number, price: number) => Promise<void>;
  sell: (quantity: number, price: number) => Promise<void>;
};

export function usePortfolioEngine(marketPrice: number): UsePortfolioEngineResult {
  const engine = useMemo(
    () => createPortfolioEngine(getDefaultPortfolioStorage()),
    [],
  );

  const [state, setState] = useState<PortfolioEngineState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
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
        setError(err instanceof Error ? err.message : "No se pudo cargar el portfolio engine");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [engine, marketPrice, refreshKey]);

  const buy = useCallback(
    async (quantity: number, price: number) => {
      const next = await engine.buy(quantity, price, marketPrice);
      setState(next);
    },
    [engine, marketPrice],
  );

  const sell = useCallback(
    async (quantity: number, price: number) => {
      const next = await engine.sell(quantity, price, marketPrice);
      setState(next);
    },
    [engine, marketPrice],
  );

  return { state, isLoading, error, refresh, buy, sell };
}
