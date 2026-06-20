import { describe, expect, it } from "vitest";

import { MOBILE_STATE_V2_POLL_INTERVAL_MS } from "@/lib/feature-flags";
import {
  computeNextPollDelayMs,
  shouldPollMarketState,
  shouldRefreshOnForeground,
} from "@/lib/market-state/pollingPolicy";
import { shouldPollV2MarketState } from "@/lib/market-state/fallbackPolicy";

describe("pollingPolicy", () => {
  it("38. Background pausa polling flag", () => {
    expect(shouldPollMarketState(false, true)).toBe(false);
    expect(shouldPollMarketState(true, true)).toBe(true);
  });

  it("39. Foreground refresca", () => {
    expect(shouldRefreshOnForeground(false, true)).toBe(true);
    expect(shouldRefreshOnForeground(true, true)).toBe(false);
  });

  it("40. 429 respeta Retry-After", () => {
    const now = 1_000;
    const retryAfterUntil = now + 12_000;
    expect(computeNextPollDelayMs(now, retryAfterUntil)).toBe(12_000);
    expect(computeNextPollDelayMs(now, 0)).toBe(MOBILE_STATE_V2_POLL_INTERVAL_MS);
  });

  it("v2 polling requires authenticated session", () => {
    expect(shouldPollV2MarketState(true, "loading")).toBe(false);
    expect(shouldPollV2MarketState(true, "unauthenticated")).toBe(false);
    expect(shouldPollV2MarketState(true, "authenticated")).toBe(true);
  });
});
