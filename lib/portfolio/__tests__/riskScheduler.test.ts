import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { createLiquidationEngine } from "@/lib/portfolio/risk/LiquidationEngine";
import { createRiskScheduler } from "@/lib/portfolio/risk/RiskScheduler";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

function createMutablePriceFeed(initial: number | null = null) {
  let price = initial;
  return {
    getLastPrice: () => price,
    setPrice: (next: number | null) => {
      price = next;
    },
  };
}

describe("RiskScheduler", () => {
  let storage: MemoryPortfolioStorage;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes liquidations without a manual onPriceUpdate", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 2,
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.buy(1, 60_000, 60_000);
    // Breach long liquidation (30k) without calling onPriceUpdate.
    priceFeed.setPrice(30_000);
    await scheduler.tick();

    const state = await engine.getState(30_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
  });

  it("liquidates while UI is idle (no onPriceUpdate)", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 2,
      positionMode: "LONG_SHORT",
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.sell(1, 60_000, 60_000);
    priceFeed.setPrice(90_000);

    // Simulate idle UI: only scheduler ticks.
    await scheduler.tick();

    const open = await engine.getOpenPositions(90_000);
    expect(open).toHaveLength(0);
  });

  it("start/stop controls the interval loop", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 2,
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);
    const tickSpy = vi.spyOn(scheduler, "tick");

    await engine.buy(1, 60_000, 60_000);
    priceFeed.setPrice(30_000);

    scheduler.start(1000);
    expect(scheduler.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(tickSpy).toHaveBeenCalledTimes(1);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(tickSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores parallel ticks (no double execution)", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 2,
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.buy(1, 60_000, 60_000);
    priceFeed.setPrice(30_000);

    const evaluateSpy = vi.spyOn(liquidationEngine, "evaluate");
    const executeSpy = vi.spyOn(liquidationEngine, "executeLiquidation");

    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(evaluateSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    const state = await engine.getState(30_000);
    expect(state.trades).toHaveLength(2);
    expect(state.positions).toHaveLength(0);
  });
});
