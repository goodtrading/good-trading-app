import { useEffect } from "react";

import { useLiveSpotPrices } from "@/hooks/useLiveSpotPrices";
import { marketTickStore } from "@/lib/market/MarketTickStore";

const BTC_SYMBOL = "BTCUSDT";
const ETH_SYMBOL = "ETHUSDT";

/**
 * Bridges the spot feed into MarketTickStore.
 * Renders nothing; keeps tick propagation out of the React tree.
 */
export function MarketTickPublisher() {
  const feed = useLiveSpotPrices();

  useEffect(() => {
    marketTickStore.publishFeed({
      isLive: feed.isLive,
      isLoading: feed.isLoading,
    });
  }, [feed.isLive, feed.isLoading]);

  useEffect(() => {
    marketTickStore.publishTick(BTC_SYMBOL, feed.btcPrice);
  }, [feed.btcPrice]);

  useEffect(() => {
    marketTickStore.publishTick(ETH_SYMBOL, feed.ethPrice);
  }, [feed.ethPrice]);

  return null;
}
