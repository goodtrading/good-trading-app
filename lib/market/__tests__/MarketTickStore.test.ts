import { describe, expect, it, vi } from "vitest";

import { marketTickStore } from "@/lib/market/MarketTickStore";

describe("marketTickStore", () => {
  it("publishes ticks and notifies subscribers", () => {
    const listener = vi.fn();
    const unsub = marketTickStore.subscribe(listener);

    marketTickStore.publishTick("BTCUSDT", 100_000);
    expect(marketTickStore.getPrice("BTCUSDT")).toBe(100_000);
    expect(listener).toHaveBeenCalled();

    marketTickStore.publishTick("BTCUSDT", 100_000);
    expect(listener).toHaveBeenCalledTimes(1);

    marketTickStore.publishTick("BTCUSDT", 100_001);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });

  it("publishes feed metadata without duplicate emits", () => {
    const listener = vi.fn();
    const unsub = marketTickStore.subscribe(listener);

    marketTickStore.publishFeed({ isLive: true, isLoading: false });
    marketTickStore.publishFeed({ isLive: true, isLoading: false });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
  });
});
