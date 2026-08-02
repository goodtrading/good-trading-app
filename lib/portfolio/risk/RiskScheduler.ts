import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { LiquidationEngine } from "@/lib/portfolio/risk/LiquidationEngine";

/**
 * Price source for autonomous risk evaluation.
 * Independent from UI navigation and render cycles.
 */
export interface RiskPriceFeed {
  getLastPrice(): number | null;
}

export type RiskSchedulerHooks = {
  /** Cancel linked TP/SL after a position is liquidated. */
  onPositionLiquidated?: (symbol: string) => Promise<void> | void;
};

/**
 * Autonomous risk loop.
 * Evaluates liquidations on a timer — does not depend on UI or onPriceUpdate.
 */
export class RiskScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;

  constructor(
    private readonly portfolioEngine: PortfolioEngine,
    private readonly liquidationEngine: LiquidationEngine,
    private readonly priceFeed: RiskPriceFeed,
    private readonly hooks: RiskSchedulerHooks = {},
  ) {}

  start(intervalMs: number = 1000): void {
    if (this.timer != null) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer == null) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer != null;
  }

  /**
   * Single risk evaluation cycle.
   * Concurrent ticks are ignored (no double execution).
   */
  async tick(): Promise<void> {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;
    console.log("[RISK TICK]");

    try {
      const price = this.priceFeed.getLastPrice();
      console.log("[PRICE FETCH]", { price });

      if (price == null || !Number.isFinite(price) || price <= 0) {
        return;
      }

      const positions = await this.portfolioEngine.getOpenPositions(price);
      const portfolioState = await this.portfolioEngine.getState(price);

      for (const position of positions) {
        console.log("[RISK EVALUATION]", {
          positionId: position.symbol,
          quantity: position.quantity,
          avgEntry: position.avgEntry,
          marketPrice: price,
        });

        const liquidation = this.liquidationEngine.evaluate(
          position,
          price,
          portfolioState,
        );

        if (liquidation == null) {
          continue;
        }

        try {
          await this.liquidationEngine.executeLiquidation(liquidation.positionId);
          await this.hooks.onPositionLiquidated?.(liquidation.positionId);
        } catch (error) {
          console.error("[LIQUIDATION FAILED]", error);
        }

        // Re-load state after a liquidation before evaluating further positions.
        break;
      }
    } catch (error) {
      console.error("[RISK TICK FAILED]", error);
    } finally {
      this.isTicking = false;
    }
  }
}

export function createRiskScheduler(
  portfolioEngine: PortfolioEngine,
  liquidationEngine: LiquidationEngine,
  priceFeed: RiskPriceFeed,
  hooks: RiskSchedulerHooks = {},
): RiskScheduler {
  return new RiskScheduler(portfolioEngine, liquidationEngine, priceFeed, hooks);
}
