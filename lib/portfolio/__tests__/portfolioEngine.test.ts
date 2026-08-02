import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { closeFee, openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { buildPosition } from "@/lib/portfolio/positionEngine";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

describe("Portfolio Engine V1 (Futures)", () => {
  let storage: MemoryPortfolioStorage;
  let engine: ReturnType<typeof createPortfolioEngine>;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    engine = createPortfolioEngine(storage, new PaperBroker());
  });

  it("1 — BUY 1 BTC @ 60k locks margin only (not full notional)", async () => {
    const state = await engine.buy(1, 60_000, 60_000);
    const btc = buildPosition(state.trades, 60_000);

    expect(btc?.quantity).toBe(1);
    expect(btc?.avgEntry).toBe(60_000);
    expect(state.portfolio.walletBalance).toBeCloseTo(500_000 - openFee(1, 60_000), 4);
    expect(state.portfolio.marginUsed).toBe(60_000);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
    expect(state.trades).toHaveLength(1);
    expect(state.trades[0]?.symbol).toBe(PORTFOLIO_V1_SYMBOL);
  });

  it("2 — two buys → quantity = 2, avgEntry = 65k", async () => {
    await engine.buy(1, 60_000, 65_000);
    const state = await engine.buy(1, 70_000, 65_000);
    const btc = buildPosition(state.trades, 65_000);

    expect(btc?.quantity).toBe(2);
    expect(btc?.avgEntry).toBe(65_000);
  });

  it("3 — partial sell → realizedPnL = +10k, quantity = 1, avgEntry = 60k", async () => {
    await engine.buy(2, 60_000, 70_000);
    const state = await engine.sell(1, 70_000, 70_000);
    const btc = buildPosition(state.trades, 70_000);

    expect(btc?.quantity).toBe(1);
    expect(btc?.avgEntry).toBe(60_000);
    expect(btc?.realizedPnL).toBe(10_000);
    expect(state.portfolio.realizedPnL).toBe(10_000);
    expect(state.portfolio.walletBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(2, 60_000) - closeFee(1, 70_000),
      4,
    );
  });

  it("4 — portfolio is recalculated after each trade", async () => {
    const afterBuy = await engine.buy(1, 60_000, 62_000);
    const open = openFee(1, 60_000);
    expect(afterBuy.portfolio.walletBalance).toBeCloseTo(500_000 - open, 4);
    expect(afterBuy.portfolio.unrealizedPnL).toBe(2_000);
    expect(afterBuy.portfolio.equity).toBeCloseTo(500_000 - open + 2_000, 4);
    expect(afterBuy.portfolio.cashBalance).toBeCloseTo(500_000 - open - 60_000 + 2_000, 4);

    const afterSell = await engine.sell(0.5, 64_000, 64_000);
    expect(afterSell.trades).toHaveLength(2);
    expect(afterSell.portfolio.walletBalance).toBeCloseTo(
      500_000 + 2_000 - open - closeFee(0.5, 64_000),
      4,
    );
    expect(afterSell.portfolio.realizedPnL).toBe(2_000);
    expect(afterSell.portfolio.cashBalance).toBeGreaterThan(afterBuy.portfolio.cashBalance);
  });

  it("rejects sells beyond open long quantity (no shorts in LONG_ONLY)", async () => {
    await engine.buy(1, 60_000, 60_000);
    await expect(engine.sell(2, 65_000, 65_000)).rejects.toThrow(/Insufficient position/);
  });

  it("rejects opens beyond available margin", async () => {
    await expect(engine.buy(10, 60_000, 60_000)).rejects.toThrow(/Insufficient cash/);
  });

  it("derives wallet from initial balance + realized PnL − fees", async () => {
    await engine.buy(1, 60_000, 60_000);
    const persisted = await storage.load();

    expect(persisted.trades).toHaveLength(1);
    expect(persisted.orders).toEqual([]);
    expect(persisted.fills).toEqual([]);

    const state = await engine.getState(60_000);
    expect(state.portfolio.walletBalance).toBeCloseTo(500_000 - openFee(1, 60_000), 4);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
  });
});

describe("positionEngine", () => {
  it("computes unrealized PnL from market price", () => {
    const trades = [
      {
        id: "t1",
        symbol: PORTFOLIO_V1_SYMBOL,
        side: "BUY" as const,
        quantity: 1,
        price: 60_000,
        timestamp: 1,
        source: "PAPER" as const,
      },
    ];

    const position = buildPosition(trades, 65_000);
    expect(position?.unrealizedPnL).toBe(5_000);
    expect(position?.entryMargin).toBe(60_000);
  });
});

describe("PaperBroker", () => {
  it("implements Broker interface and records trades", async () => {
    const broker = new PaperBroker();
    const trade = await broker.buy({
      symbol: PORTFOLIO_V1_SYMBOL,
      quantity: 1,
      price: 60_000,
    });

    expect(trade.source).toBe("PAPER");
    expect(await broker.getTrades()).toHaveLength(1);
  });
});
