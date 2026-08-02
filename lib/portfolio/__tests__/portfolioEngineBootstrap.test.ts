import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPortfolioEngineBootstrap,
  type PortfolioEngineBootstrap,
} from "@/lib/portfolio/bootstrap/PortfolioEngineBootstrap";
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

describe("PortfolioEngineBootstrap", () => {
  let bootstrap: PortfolioEngineBootstrap;

  afterEach(() => {
    bootstrap?.stop();
  });

  it("start wires engine stack and getEngine returns PortfolioEngine", () => {
    bootstrap = createPortfolioEngineBootstrap();
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const priceFeed = createMutablePriceFeed(60_000);

    const engine = bootstrap.start({
      storage,
      priceFeed,
      positionMode: "LONG_SHORT",
      leverage: 2,
      autoStartRisk: false,
    });

    expect(bootstrap.isStarted()).toBe(true);
    expect(bootstrap.getEngine()).toBe(engine);
    expect(engine.getPositionMode()).toBe("LONG_SHORT");
    expect(engine.getLeverage()).toBe(2);
    expect(bootstrap.getLiquidationEngine()).toBeDefined();
    expect(bootstrap.getRiskScheduler()).toBeDefined();
    expect(bootstrap.getPriceFeed()).toBe(priceFeed);
    expect(bootstrap.getBroker()).toBeDefined();
  });

  it("stop tears down risk scheduler and clears engine access", () => {
    bootstrap = createPortfolioEngineBootstrap();
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const priceFeed = createMutablePriceFeed(60_000);

    bootstrap.start({
      storage,
      priceFeed,
      riskIntervalMs: 1000,
      autoStartRisk: true,
    });

    expect(bootstrap.getRiskScheduler().isRunning()).toBe(true);

    bootstrap.stop();

    expect(bootstrap.isStarted()).toBe(false);
    expect(() => bootstrap.getEngine()).toThrow(/not started/);
    expect(() => bootstrap.getRiskScheduler()).toThrow(/not started/);
  });

  it("start clears prior state instead of throwing on double start", () => {
    bootstrap = createPortfolioEngineBootstrap();
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const priceFeed = createMutablePriceFeed(60_000);

    const first = bootstrap.start({ storage, priceFeed, autoStartRisk: true });
    const second = bootstrap.start({ storage, priceFeed, autoStartRisk: false });

    expect(bootstrap.isStarted()).toBe(true);
    expect(second).not.toBe(first);
    expect(bootstrap.getRiskScheduler().isRunning()).toBe(false);
  });

  it("risk scheduler liquidates through bootstrap without onPriceUpdate", async () => {
    bootstrap = createPortfolioEngineBootstrap();
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const priceFeed = createMutablePriceFeed(60_000);

    const engine = bootstrap.start({
      storage,
      priceFeed,
      leverage: 2,
      marginMode: "ISOLATED",
      autoStartRisk: false,
    });

    await engine.buy(1, 60_000, 60_000);
    priceFeed.setPrice(30_000);

    await bootstrap.getRiskScheduler().tick();

    const state = await engine.getState(30_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
  });

  it("start/stop with interval does not tick after stop", async () => {
    vi.useFakeTimers();
    bootstrap = createPortfolioEngineBootstrap();
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const priceFeed = createMutablePriceFeed(60_000);

    bootstrap.start({
      storage,
      priceFeed,
      riskIntervalMs: 500,
      autoStartRisk: true,
    });

    const scheduler = bootstrap.getRiskScheduler();
    const tickSpy = vi.spyOn(scheduler, "tick");

    await vi.advanceTimersByTimeAsync(500);
    expect(tickSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    const callsAtStop = tickSpy.mock.calls.length;
    bootstrap.stop();

    await vi.advanceTimersByTimeAsync(2000);
    expect(tickSpy.mock.calls.length).toBe(callsAtStop);

    vi.useRealTimers();
  });
});
