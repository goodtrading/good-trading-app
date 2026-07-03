import { useMemo } from "react";

import { useMarketStateWithFallback } from "@/hooks/useMarketStateWithFallback";

function readLegacySpot(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const market = (data as { market?: { spot?: unknown } }).market;
  const spot = market?.spot;
  if (typeof spot === "number" && Number.isFinite(spot) && spot > 0) return spot;
  return null;
}

function readV2Spot(
  spot: { value?: number | null; status?: string } | null | undefined,
): number | null {
  if (!spot || spot.value == null || !Number.isFinite(spot.value) || spot.value <= 0) {
    return null;
  }
  if (spot.status === "unavailable") return null;
  return spot.value;
}

export type LiveSpotPriceFeed = {
  btcPrice: number | null;
  ethPrice: number | null;
  isLive: boolean;
  btcSource: "v2" | "legacy" | null;
  isLoading: boolean;
};

/**
 * Single source of truth for spot prices used by Paper Trading mark-to-market.
 * Prefers Market State V2, then legacy market state. No mock/static fallbacks.
 */
export function useLiveSpotPrices(): LiveSpotPriceFeed {
  const btcFeed = useMarketStateWithFallback("BTC");
  const ethFeed = useMarketStateWithFallback("ETH");

  const btcPrice = useMemo(() => {
    const v2 = readV2Spot(btcFeed.v2.spot);
    if (v2 != null) return v2;
    return readLegacySpot(btcFeed.legacy.data);
  }, [btcFeed.legacy.data, btcFeed.v2.spot]);

  const ethPrice = useMemo(() => {
    const v2 = readV2Spot(ethFeed.v2.spot);
    if (v2 != null) return v2;
    return readLegacySpot(ethFeed.legacy.data);
  }, [ethFeed.legacy.data, ethFeed.v2.spot]);

  const btcSource = btcFeed.v2.spot?.value != null ? "v2" : btcPrice != null ? "legacy" : null;
  const isLive = btcPrice != null;

  return {
    btcPrice,
    ethPrice,
    isLive,
    btcSource,
    isLoading: btcFeed.v2.isLoading && btcPrice == null,
  };
}
