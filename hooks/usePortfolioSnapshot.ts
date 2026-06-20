import { useCallback, useEffect, useState } from "react";

import { usePortfolioSource } from "@/lib/portfolio";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";

type PortfolioSnapshotState = {
  snapshot: PortfolioSnapshot | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

export function usePortfolioSnapshot(): PortfolioSnapshotState {
  const { selectedSource, getProvider } = usePortfolioSource();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const provider = getProvider(selectedSource);

    if (!provider) {
      setSnapshot(null);
      setError("Fuente de cartera no disponible");
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    setIsLoading(true);
    setError(null);

    void provider
      .getSnapshot()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSnapshot(null);
        setError(err instanceof Error ? err.message : "No se pudo cargar la cartera");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [getProvider, refreshKey, selectedSource]);

  return { snapshot, isLoading, error, refresh };
}
