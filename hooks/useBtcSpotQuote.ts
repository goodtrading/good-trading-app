import { useMemo } from "react";

import { useMarketStateWithFallback } from "@/hooks/useMarketStateWithFallback";
import { resolveWatchlistQuote } from "@/lib/watchlist/resolveWatchlistQuote";

/** @deprecated Prefer useWatchlistMarketQuotes for watchlist screens. */
export function useBtcSpotQuote() {
  const { source, legacy, v2 } = useMarketStateWithFallback("BTC");

  return useMemo(
    () =>
      resolveWatchlistQuote({
        symbol: "BTC",
        marketStateSource: source,
        legacyMarket: legacy.data,
        v2Spot: v2.spot,
        v2Micro: v2.micro,
      }),
    [legacy.data, source, v2.micro, v2.spot],
  );
}
