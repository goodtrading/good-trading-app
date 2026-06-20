import { useMemo } from "react";

import { useMarketStateWithFallback } from "@/hooks/useMarketStateWithFallback";
import {
  resolveWatchlistQuote,
  type WatchlistMarketQuote,
} from "@/lib/watchlist/resolveWatchlistQuote";

/**
 * Resolves live market quotes for followed watchlist symbols.
 * Each supported symbol maps to its own data source without hardcoding in UI components.
 */
export function useWatchlistMarketQuotes(followedSymbols: string[]): Record<string, WatchlistMarketQuote> {
  const needsBtc = followedSymbols.includes("BTC");
  const btcMarket = useMarketStateWithFallback("BTC");

  return useMemo(() => {
    const quotes: Record<string, WatchlistMarketQuote> = {};

    if (needsBtc) {
      quotes.BTC = resolveWatchlistQuote({
        symbol: "BTC",
        marketStateSource: btcMarket.source,
        legacyMarket: btcMarket.legacy.data,
        v2Spot: btcMarket.v2.spot,
        v2Micro: btcMarket.v2.micro,
      });
    }

    return quotes;
  }, [
    needsBtc,
    btcMarket.source,
    btcMarket.legacy.data,
    btcMarket.v2.spot,
    btcMarket.v2.micro,
  ]);
}
