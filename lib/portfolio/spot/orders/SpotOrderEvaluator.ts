import {
  SpotOrderRegistry,
  spotOrderRegistry,
} from "@/lib/portfolio/spot/orders/SpotOrderRegistry";

export type SpotOrderEvaluatorDeps = {
  walletId: string;
  getPrice: () => number | null;
  onOrdersChanged?: () => void;
};

/**
 * Evaluates PENDING SPOT LIMIT orders against mark price.
 * BUY fills when market <= limit; SELL fills when market >= limit.
 * Uses SpotOrderRegistry only — never PERP OrderPriceEvaluator.
 */
export class SpotOrderEvaluator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;

  constructor(
    private readonly deps: SpotOrderEvaluatorDeps,
    private readonly registry: SpotOrderRegistry = spotOrderRegistry,
  ) {}

  start(intervalMs: number = 1000): void {
    if (this.timer != null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer == null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer != null;
  }

  async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const price = this.deps.getPrice();
      if (price == null || price <= 0) return;

      const open = await this.registry.listOpen(this.deps.walletId);
      let changed = false;

      for (const order of open) {
        if (order.orderType === "LIMIT" && order.triggerPrice != null) {
          if (!shouldFillSpotLimit(order.side, order.triggerPrice, price)) continue;
          try {
            await this.registry.fill(this.deps.walletId, order.id);
            changed = true;
          } catch (error) {
            console.error("[SPOT ORDER FILL FAILED]", {
              orderId: order.id,
              error,
            });
          }
          continue;
        }

        if (
          order.orderType === "STOP" &&
          order.side === "SELL" &&
          order.triggerPrice != null &&
          shouldTriggerSpotStopSell(order.triggerPrice, price)
        ) {
          try {
            await this.registry.triggerStopSell(
              this.deps.walletId,
              order.id,
              price,
            );
            changed = true;
          } catch (error) {
            console.error("[SPOT STOP TRIGGER FAILED]", {
              orderId: order.id,
              error,
            });
          }
        }
      }

      if (changed) {
        this.deps.onOrdersChanged?.();
      }
    } catch (error) {
      console.error("[SPOT ORDER EVALUATOR TICK FAILED]", error);
    } finally {
      this.isTicking = false;
    }
  }
}

export function shouldFillSpotLimit(
  side: "BUY" | "SELL",
  limitPrice: number,
  marketPrice: number,
): boolean {
  if (side === "BUY") return marketPrice <= limitPrice;
  return marketPrice >= limitPrice;
}

/** STOP SELL triggers when mark falls to or below stop price. */
export function shouldTriggerSpotStopSell(
  stopPrice: number,
  marketPrice: number,
): boolean {
  return marketPrice <= stopPrice;
}

export function createSpotOrderEvaluator(
  deps: SpotOrderEvaluatorDeps,
): SpotOrderEvaluator {
  return new SpotOrderEvaluator(deps);
}
