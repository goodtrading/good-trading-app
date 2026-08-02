/**
 * UI-facing price stream.
 * Publishes price updates from the runtime price feed without touching
 * RiskScheduler or MatchingEngine.
 */
export type PriceStreamListener = (price: number | null) => void;

class PriceStreamImpl {
  private price: number | null = null;
  private readonly listeners = new Set<PriceStreamListener>();

  getLastPrice(): number | null {
    return this.price;
  }

  publish(price: number | null): void {
    const next =
      price != null && Number.isFinite(price) && price > 0 ? price : null;
    this.price = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (error) {
        console.warn("[PRICE STREAM LISTENER FAILED]", error);
      }
    }
  }

  subscribe(listener: PriceStreamListener): () => void {
    this.listeners.add(listener);
    listener(this.price);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Test helper. */
  resetForTests(): void {
    this.price = null;
    this.listeners.clear();
  }
}

export const priceStream = new PriceStreamImpl();
