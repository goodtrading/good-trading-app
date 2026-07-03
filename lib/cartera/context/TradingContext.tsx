import React, { createContext, useContext, type ReactNode } from "react";

import { PortfolioSourceProvider, usePortfolioSource } from "@/lib/portfolio";
import type { PortfolioSourceContextValue } from "@/lib/portfolio/types";

const TradingBoundaryContext = createContext(false);

/**
 * WRITE context — trading wallets, ledger writes, broker adapters.
 * PortfolioSourceProvider is scoped here only (not app-global).
 */
export function TradingContextProvider({ children }: { children: ReactNode }) {
  return (
    <TradingBoundaryContext.Provider value={true}>
      <PortfolioSourceProvider>{children}</PortfolioSourceProvider>
    </TradingBoundaryContext.Provider>
  );
}

export type TradingContextValue = PortfolioSourceContextValue;

export function useTradingContext(): TradingContextValue {
  const inTrading = useContext(TradingBoundaryContext);
  if (!inTrading) {
    throw new Error(
      "useTradingContext must be used within TradingContextProvider (TRADING bounded context only)",
    );
  }
  return usePortfolioSource();
}
