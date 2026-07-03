import { describe, expect, it } from "vitest";

import {
  aggregatePositionsBySymbol,
  groupSmallSlices,
  ledgerProjectionToPositions,
} from "@/lib/cartera/read/portfolioReadProjection";
import type { PortfolioEngineState, PortfolioPosition } from "@/lib/portfolio/types";

describe("consolidatedWealth", () => {
  it("aggregates positions by symbol across accounts", () => {
    const positions: PortfolioPosition[] = [
      {
        symbol: "BTC",
        name: "Bitcoin",
        type: "spot",
        quantity: 0.1,
        entryPrice: 80000,
        currentPrice: 82000,
        valueUSD: 8200,
        pnl: 200,
        pnlPercent: 2.5,
      },
      {
        symbol: "BTC",
        name: "Bitcoin",
        type: "spot",
        quantity: 0.05,
        entryPrice: 79000,
        currentPrice: 82000,
        valueUSD: 4100,
        pnl: 150,
        pnlPercent: 3.8,
      },
      {
        symbol: "USDT",
        name: "Tether",
        type: "usdt",
        quantity: 1000,
        entryPrice: 1,
        currentPrice: 1,
        valueUSD: 1000,
        pnl: 0,
        pnlPercent: 0,
      },
    ];

    const slices = aggregatePositionsBySymbol(positions);
    expect(slices).toHaveLength(2);
    expect(slices[0]?.symbol).toBe("BTC");
    expect(slices[0]?.valueUSD).toBe(12300);
    expect(slices[0]?.percent).toBeCloseTo(92.5, 0);
  });

  it("groups small slices into OTHER bucket", () => {
    const slices = groupSmallSlices([
      { symbol: "BTC", name: "Bitcoin", quantity: 1, valueUSD: 8000, percent: 80 },
      { symbol: "ETH", name: "Ethereum", quantity: 1, valueUSD: 1500, percent: 15 },
      { symbol: "SOL", name: "Solana", quantity: 1, valueUSD: 300, percent: 3 },
    ]);

    expect(slices.some((slice) => slice.symbol === "OTHER")).toBe(true);
    expect(slices.some((slice) => slice.symbol === "SOL")).toBe(false);
  });

  it("maps engine state into portfolio positions including cash", () => {
    const state: PortfolioEngineState = {
      portfolio: {
        cashBalance: 2500,
        equity: 10500,
        realizedPnL: 0,
        unrealizedPnL: 500,
        totalReturnPercent: 5,
      },
      positions: [
        {
          symbol: "BTCUSDT",
          quantity: 0.1,
          avgEntry: 80000,
          marketPrice: 85000,
          unrealizedPnL: 500,
          realizedPnL: 0,
        },
      ],
      trades: [],
      initialCashBalance: 10000,
    };

    const positions = ledgerProjectionToPositions(state);
    expect(positions).toHaveLength(2);
    expect(positions.some((position) => position.symbol === "BTC")).toBe(true);
    expect(positions.some((position) => position.symbol === "USDT")).toBe(true);
  });
});
