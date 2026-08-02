import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  computeLiquidationPrice,
  createLiquidationEngine,
} from "@/lib/portfolio/risk/LiquidationEngine";
import { computeLiquidationState } from "@/lib/portfolio/futures/MarginModel";
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

describe("LiquidationEngine (Futures)", () => {
  let storage: MemoryPortfolioStorage;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
  });

  it("does not liquidate when leverage is 1", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 1,
      positionMode: "LONG_ONLY",
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(1);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.buy(1, 60_000, 60_000);
    await scheduler.tick();

    const state = await engine.getState(1);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]?.quantity).toBe(1);
  });

  it("liquidates an isolated long when equity <= maintenance margin", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_ONLY",
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.buy(1, 60_000, 60_000);
    // entryMargin = 6_000; wipe position equity
    priceFeed.setPrice(53_000);
    await scheduler.tick();

    const state = await engine.getState(53_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
    expect(state.trades[1]?.side).toBe("SELL");
    expect(state.trades[1]?.liquidation).toBe(true);
    expect(state.portfolio.realizedPnL).toBe(-7_000);
  });

  it("cross long with large wallet survives the same drawdown", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_ONLY",
      marginMode: "CROSS",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.buy(1, 60_000, 60_000);
    priceFeed.setPrice(53_000);
    await scheduler.tick();

    const state = await engine.getState(53_000);
    expect(state.positions).toHaveLength(1);
    expect(state.trades).toHaveLength(1);
  });

  it("liquidates a short when market price rises enough", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_SHORT",
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine);
    const priceFeed = createMutablePriceFeed(60_000);
    const scheduler = createRiskScheduler(engine, liquidationEngine, priceFeed);

    await engine.sell(1, 60_000, 60_000);
    priceFeed.setPrice(67_000);
    await scheduler.tick();

    const state = await engine.getState(67_000);
    expect(state.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(2);
    expect(state.trades[1]?.side).toBe("BUY");
    expect(state.trades[1]?.liquidation).toBe(true);
    expect(state.portfolio.realizedPnL).toBe(-7_000);
  });

  it("evaluate returns null when equity is healthy", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 2,
      marginMode: "ISOLATED",
    });
    await engine.buy(1, 60_000, 60_000);
    const state = await engine.getState(50_000);
    const position = state.positions[0]!;
    const liquidationEngine = createLiquidationEngine(engine);

    expect(liquidationEngine.evaluate(position, 50_000, state)).toBeNull();
    expect(computeLiquidationPrice(position, state.portfolio.walletBalance)).toBeCloseTo(
      computeLiquidationState({
        quantity: position.quantity,
        avgEntry: position.avgEntry,
        entryMargin: position.entryMargin,
        markPrice: 50_000,
        leverage: position.leverage,
        marginMode: position.marginMode,
        walletBalance: state.portfolio.walletBalance,
      }).liquidationPrice!,
      5,
    );
  });

  it("executeLiquidation closes the position and returns created trades", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_SHORT",
      marginMode: "ISOLATED",
    });
    await engine.sell(1, 60_000, 60_000);
    await engine.getState(67_000);

    const liquidationEngine = createLiquidationEngine(engine);
    const trades = await liquidationEngine.executeLiquidation("BTCUSDT");

    expect(trades).toHaveLength(1);
    expect(trades[0]?.side).toBe("BUY");
    expect(trades[0]?.liquidation).toBe(true);
    const state = await engine.getState(67_000);
    expect(state.positions).toHaveLength(0);
  });

  it("onPriceUpdate does not liquidate (risk is scheduler-owned)", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_ONLY",
      marginMode: "ISOLATED",
    });

    await engine.buy(1, 60_000, 60_000);
    const state = await engine.onPriceUpdate(53_000);

    expect(state.positions).toHaveLength(1);
    expect(state.trades).toHaveLength(1);
  });
});
