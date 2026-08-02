import { describe, expect, it } from "vitest";

import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  closeQuantityFromPercent,
  maxSpotSellQuantity,
  resolveSpotPositionQuantity,
} from "@/lib/portfolio/spot/spotSizing";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";

const openPosition = (quantity: number): SpotPositionLive => ({
  id: "p1",
  walletId: "w1",
  domain: "SPOT",
  symbol: PORTFOLIO_V1_SYMBOL,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  quantity,
  averageEntry: 50_000,
  realizedPnL: 0,
  status: "OPEN",
  createdAt: 0,
  updatedAt: 0,
  marketPrice: 60_000,
  marketValue: quantity * 60_000,
  unrealizedPnL: 0,
  unrealizedPnLPercent: 0,
});

describe("spotSizing (PositionSizing facade)", () => {
  it("resolveSpotPositionQuantity reads open position", () => {
    expect(resolveSpotPositionQuantity([openPosition(0.0365)], PORTFOLIO_V1_SYMBOL)).toBeCloseTo(
      0.0365,
      8,
    );
    expect(resolveSpotPositionQuantity([], PORTFOLIO_V1_SYMBOL)).toBe(0);
  });

  it("maxSpotSellQuantity uses position only", () => {
    expect(maxSpotSellQuantity(PORTFOLIO_V1_SYMBOL, 0.0365)).toBeCloseTo(0.0365, 8);
  });

  it("closeQuantityFromPercent does not cap by wallet free", () => {
    const half = closeQuantityFromPercent(PORTFOLIO_V1_SYMBOL, 0.0365, 50);
    expect(half).toBeCloseTo(0.01825, 8);
    expect(closeQuantityFromPercent(PORTFOLIO_V1_SYMBOL, 0.0365, 100)).toBeCloseTo(0.0365, 8);
  });
});
