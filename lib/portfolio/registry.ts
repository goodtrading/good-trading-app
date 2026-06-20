import { createConsolidatedProvider, mockPortfolioProviders } from "./mockProviders";
import { PORTFOLIO_SOURCE_CATALOG, VISIBLE_PORTFOLIO_SOURCE_IDS } from "./sourceCatalog";
import type { PortfolioProvider, PortfolioSourceId, PortfolioSourceMeta } from "./types";

class PortfolioProviderRegistry {
  private readonly providers = new Map<PortfolioSourceId, PortfolioProvider>();

  constructor() {
    this.register(mockPortfolioProviders.paper);
    this.register(mockPortfolioProviders.binance);
    this.register(mockPortfolioProviders.bingx);
    this.register(
      createConsolidatedProvider([
        mockPortfolioProviders.paper,
        mockPortfolioProviders.binance,
        mockPortfolioProviders.bingx,
      ]),
    );
  }

  register(provider: PortfolioProvider): void {
    this.providers.set(provider.meta.id, provider);
  }

  get(id: PortfolioSourceId): PortfolioProvider | undefined {
    return this.providers.get(id);
  }

  getVisibleMeta(): PortfolioSourceMeta[] {
    return VISIBLE_PORTFOLIO_SOURCE_IDS.map((id) => PORTFOLIO_SOURCE_CATALOG[id]);
  }
}

export const portfolioProviderRegistry = new PortfolioProviderRegistry();
