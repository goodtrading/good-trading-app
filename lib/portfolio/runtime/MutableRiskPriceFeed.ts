import type { RiskPriceFeed } from "@/lib/portfolio/risk/RiskScheduler";

/**
 * Shared mutable price feed for RiskScheduler.
 * Updated by the UI layer when live spot prices change.
 */
export class MutableRiskPriceFeed implements RiskPriceFeed {
  private price: number | null = null;

  getLastPrice(): number | null {
    return this.price;
  }

  setPrice(price: number | null): void {
    if (price == null || !Number.isFinite(price) || price <= 0) {
      this.price = null;
      return;
    }
    this.price = price;
  }
}
