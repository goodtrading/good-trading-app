import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  marketTickStore,
  type MarketFeedSnapshot,
  type MarketTickSnapshot,
} from "@/lib/market/MarketTickStore";

function subscribe(listener: () => void): () => void {
  return marketTickStore.subscribe(listener);
}

/**
 * Live mark for a symbol — only subscribers re-render on tick.
 */
export function useMarketTick(symbol: string): MarketTickSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => marketTickStore.getSnapshot(symbol),
    () => marketTickStore.getSnapshot(symbol),
  );
}

/** Feed connectivity — changes only when live/loading state changes, not each tick. */
export function useMarketFeed(): MarketFeedSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => marketTickStore.getFeedSnapshot(),
    () => marketTickStore.getFeedSnapshot(),
  );
}

/**
 * Stable ref synced with the tick store — no re-renders on tick.
 */
export function useMarketPriceRef(symbol: string): React.MutableRefObject<number | null> {
  const ref = useRef<number | null>(marketTickStore.getPrice(symbol));

  useEffect(() => {
    const sync = () => {
      ref.current = marketTickStore.getPrice(symbol);
    };
    sync();
    return marketTickStore.subscribe(sync);
  }, [symbol]);

  return ref;
}

export function getMarketPrice(symbol: string): number | null {
  return marketTickStore.getPrice(symbol);
}
