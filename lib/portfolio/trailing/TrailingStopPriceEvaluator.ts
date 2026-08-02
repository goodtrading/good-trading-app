import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { trailingStopRuntime } from "@/lib/portfolio/trailing/TrailingStopRuntime";

export type TrailingStopEvaluatorDeps = {
  walletId: string;
  getEngine: () => PortfolioEngine | null;
  getPrice: () => number | null;
  onTrailingChanged?: () => void;
};

/**
 * Evaluates active trailing stops on each price tick.
 * Writes only through ExecutionRouter.
 */
export class TrailingStopPriceEvaluator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;

  constructor(private readonly deps: TrailingStopEvaluatorDeps) {}

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

  async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const price = this.deps.getPrice();
      if (price == null || price <= 0) return;

      const engine = this.deps.getEngine();
      if (!engine) return;

      const { toTrigger } = await trailingStopRuntime.evaluateMarkUpdates(
        this.deps.walletId,
        price,
      );

      if (toTrigger.length === 0) return;

      let changed = false;
      for (const stop of toTrigger) {
        const latest = await trailingStopRuntime.getById(this.deps.walletId, stop.id);
        if (latest == null || latest.status !== "ACTIVE") continue;

        try {
          await executionRouter.dispatch(engine, {
            type: "TRIGGER_TRAILING_STOP",
            domain: "PERP",
            walletId: this.deps.walletId,
            trailingStopId: stop.id,
            marketPrice: price,
          });
          changed = true;
        } catch (error) {
          console.error("[TRAILING STOP TRIGGER FAILED]", {
            stopId: stop.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      if (changed) {
        this.deps.onTrailingChanged?.();
      }
    } catch (error) {
      console.error("[TRAILING EVALUATOR TICK FAILED]", error);
    } finally {
      this.isTicking = false;
    }
  }
}

export function createTrailingStopPriceEvaluator(
  deps: TrailingStopEvaluatorDeps,
): TrailingStopPriceEvaluator {
  return new TrailingStopPriceEvaluator(deps);
}
