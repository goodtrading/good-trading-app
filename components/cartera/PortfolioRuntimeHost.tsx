import { useEffect } from "react";

import { useTradingContext } from "@/lib/cartera";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { marketTickStore } from "@/lib/market/MarketTickStore";
import { portfolioEngineRuntime } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";

/**
 * Owns PortfolioEngineRuntime lifecycle for the TRADING bounded context.
 * Price updates flow through MarketTickStore — no React prop drilling.
 */
export function PortfolioRuntimeHost() {
  const { selectedPaperAccountId, isPaperView } = useTradingContext();

  useEffect(() => {
    if (!isPaperView || !selectedPaperAccountId) {
      void portfolioEngineRuntime.stopActive();
      return;
    }

    const startPrice = marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL);
    void portfolioEngineRuntime.switchAccount(selectedPaperAccountId, {
      marketPrice: startPrice,
    });

    return () => {
      void portfolioEngineRuntime.stopActive();
    };
  }, [isPaperView, selectedPaperAccountId]);

  useEffect(() => {
    const sync = () => {
      portfolioEngineRuntime.updatePrice(marketTickStore.getPrice(PORTFOLIO_V1_SYMBOL));
    };
    sync();
    return marketTickStore.subscribe(sync);
  }, []);

  return null;
}
