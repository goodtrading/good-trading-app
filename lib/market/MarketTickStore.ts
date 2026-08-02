export type MarketTickSnapshot = {
  price: number | null;
  updatedAt: number;
};

export type MarketFeedSnapshot = {
  isLive: boolean;
  isLoading: boolean;
};

type Listener = () => void;

const EMPTY_TICK: MarketTickSnapshot = { price: null, updatedAt: 0 };

const DEFAULT_FEED: MarketFeedSnapshot = { isLive: false, isLoading: true };

/**
 * External store for live marks — UI subscribes per symbol without parent re-renders.
 * Financial engines read snapshots/refs; they are not driven by React props.
 */
class MarketTickStoreImpl {
  private ticks = new Map<string, MarketTickSnapshot>();
  private feed: MarketFeedSnapshot = { ...DEFAULT_FEED };
  private listeners = new Set<Listener>();

  publishTick(symbol: string, price: number | null): void {
    const normalized = price != null && Number.isFinite(price) && price > 0 ? price : null;
    const prev = this.ticks.get(symbol);
    if (prev?.price === normalized) return;

    this.ticks.set(symbol, {
      price: normalized,
      updatedAt: Date.now(),
    });
    this.emit();
  }

  publishFeed(feed: MarketFeedSnapshot): void {
    if (feed.isLive === this.feed.isLive && feed.isLoading === this.feed.isLoading) return;
    this.feed = feed;
    this.emit();
  }

  getSnapshot(symbol: string): MarketTickSnapshot {
    return this.ticks.get(symbol) ?? EMPTY_TICK;
  }

  getFeedSnapshot(): MarketFeedSnapshot {
    return this.feed;
  }

  getPrice(symbol: string): number | null {
    return this.getSnapshot(symbol).price;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const marketTickStore = new MarketTickStoreImpl();
