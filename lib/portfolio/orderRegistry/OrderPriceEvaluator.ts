import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";

export type OrderPriceEvaluatorDeps = {
  walletId: string;
  getEngine: () => PortfolioEngine | null;
  getPrice: () => number | null;
  /** Called after any status change (fill / reject / sibling cancel). */
  onOrdersChanged?: () => void;
};

/**
 * Periodic evaluator for registered PENDING orders.
 * Writes only through ExecutionRouter (Phase 3).
 * Reads open orders via OrderRegistryEngine (read path).
 */
export class OrderPriceEvaluator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;

  constructor(private readonly deps: OrderPriceEvaluatorDeps) {}

  start(intervalMs: number = 1000): void {
    if (this.timer != null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    console.log("[ORDER EVALUATOR START]", {
      walletId: this.deps.walletId,
      intervalMs,
    });
  }

  stop(): void {
    if (this.timer == null) return;
    clearInterval(this.timer);
    this.timer = null;
    console.log("[ORDER EVALUATOR STOP]", { walletId: this.deps.walletId });
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

      const engine = this.deps.getEngine();
      if (!engine) return;

      // Read-only registry access.
      const openOrders = await orderRegistryEngine.listOpen(this.deps.walletId);
      let changed = false;

      for (const order of openOrders) {
        const current = await orderRegistryEngine.getById(this.deps.walletId, order.id);
        if (!current || (current.status !== "PENDING" && current.status !== "PARTIALLY_FILLED")) {
          continue;
        }
        if (!shouldTrigger(current, price)) continue;

        try {
          await executionRouter.dispatch(engine, {
            type: "FILL_REGISTERED_ORDER",
            domain: "PERP",
            walletId: this.deps.walletId,
            order: current,
            marketPrice: price,
          });
          changed = true;

          console.log("[ORDER FILLED]", {
            orderId: current.id,
            orderType: current.orderType,
            triggerPrice: current.triggerPrice,
            marketPrice: price,
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Fill failed";
          await executionRouter.dispatch(engine, {
            type: "REJECT_REGISTERED_ORDER",
            domain: "PERP",
            walletId: this.deps.walletId,
            orderId: current.id,
            reason,
          });
          changed = true;
          console.error("[ORDER REJECTED]", { orderId: current.id, reason });
        }
      }

      if (changed) {
        this.deps.onOrdersChanged?.();
      }
    } catch (error) {
      console.error("[ORDER EVALUATOR TICK FAILED]", error);
    } finally {
      this.isTicking = false;
    }
  }
}

/**
 * Trigger rules depend only on orderType + side + triggerPrice:
 *
 * LIMIT / STOP_LIMIT (entry-style limit after stop):
 *   BUY  → market <= trigger
 *   SELL → market >= trigger
 *
 * STOP_MARKET (adverse / stop-loss):
 *   SELL (close long)  → market <= trigger
 *   BUY  (close short) → market >= trigger
 *
 * TAKE_PROFIT_* (favorable):
 *   SELL (close long)  → market >= trigger
 *   BUY  (close short) → market <= trigger
 */
export function shouldTrigger(order: OrderEntity, marketPrice: number): boolean {
  const { orderType, side, triggerPrice } = order;

  switch (orderType) {
    case "LIMIT":
    case "STOP_LIMIT":
      if (side === "BUY") return marketPrice <= triggerPrice;
      return marketPrice >= triggerPrice;

    case "STOP_MARKET":
      if (side === "SELL") return marketPrice <= triggerPrice;
      return marketPrice >= triggerPrice;

    case "TAKE_PROFIT_MARKET":
    case "TAKE_PROFIT_LIMIT":
      if (side === "SELL") return marketPrice >= triggerPrice;
      return marketPrice <= triggerPrice;

    default:
      return false;
  }
}

export function createOrderPriceEvaluator(
  deps: OrderPriceEvaluatorDeps,
): OrderPriceEvaluator {
  return new OrderPriceEvaluator(deps);
}
