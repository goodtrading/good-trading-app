import { describe, expect, it } from "vitest";

import { getMockSnapshot, mockPortfolioProviders } from "@/lib/portfolio/mockProviders";
import { portfolioProviderRegistry } from "@/lib/portfolio/registry";
import {
  PORTFOLIO_SOURCE_CATALOG,
  VISIBLE_PORTFOLIO_SOURCE_IDS,
} from "@/lib/portfolio/sourceCatalog";

describe("portfolio sources", () => {
  it("exposes visible sources without consolidated all chip", () => {
    expect(VISIBLE_PORTFOLIO_SOURCE_IDS).toEqual(["paper", "binance", "bingx"]);
    expect(PORTFOLIO_SOURCE_CATALOG.all.isVisible).toBe(false);
  });

  it("returns mock balances per source", async () => {
    const paper = await mockPortfolioProviders.paper.getBalance();
    const binance = await mockPortfolioProviders.binance.getBalance();
    const bingx = await mockPortfolioProviders.bingx.getBalance();

    expect(paper.totalValueUSD).toBe(10_000);
    expect(binance.totalValueUSD).toBe(25_000);
    expect(bingx.totalValueUSD).toBe(7_500);
  });

  it("registry resolves providers by id", () => {
    expect(portfolioProviderRegistry.get("binance")?.meta.name).toBe("Binance");
    expect(portfolioProviderRegistry.get("all")?.meta.type).toBe("consolidated");
  });

  it("consolidated provider sums connected sources", async () => {
    const consolidated = portfolioProviderRegistry.get("all");
    expect(consolidated).toBeDefined();

    const balance = await consolidated!.getBalance();
    expect(balance.totalValueUSD).toBe(42_500);
  });

  it("each source returns positions for UI refresh", async () => {
    for (const id of VISIBLE_PORTFOLIO_SOURCE_IDS) {
      const snapshot = getMockSnapshot(id);
      expect(snapshot?.positions.length).toBeGreaterThan(0);
    }
  });
});
