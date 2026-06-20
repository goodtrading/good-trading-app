import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { portfolioProviderRegistry } from "./registry";
import type { PortfolioProvider, PortfolioSourceContextValue, PortfolioSourceId } from "./types";

const PortfolioSourceContext = createContext<PortfolioSourceContextValue | null>(null);

const DEFAULT_SOURCE: PortfolioSourceId = "binance";

export function PortfolioSourceProvider({ children }: { children: ReactNode }) {
  const [selectedSource, setSelectedSourceState] = useState<PortfolioSourceId>(DEFAULT_SOURCE);

  const setSelectedSource = useCallback((source: PortfolioSourceId) => {
    setSelectedSourceState(source);
  }, []);

  const getProvider = useCallback(
    (id: PortfolioSourceId): PortfolioProvider | undefined => portfolioProviderRegistry.get(id),
    [],
  );

  const value = useMemo<PortfolioSourceContextValue>(
    () => ({
      selectedSource,
      setSelectedSource,
      visibleSources: portfolioProviderRegistry.getVisibleMeta(),
      getProvider,
    }),
    [getProvider, selectedSource, setSelectedSource],
  );

  return (
    <PortfolioSourceContext.Provider value={value}>{children}</PortfolioSourceContext.Provider>
  );
}

export function usePortfolioSource(): PortfolioSourceContextValue {
  const ctx = useContext(PortfolioSourceContext);
  if (!ctx) {
    throw new Error("usePortfolioSource must be used within PortfolioSourceProvider");
  }
  return ctx;
}
