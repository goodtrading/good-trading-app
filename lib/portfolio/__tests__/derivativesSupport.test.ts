import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import {
  createPortfolioEngine,
  RiskLimitError,
} from "@/lib/portfolio/portfolioEngine";
import { closeFee, openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

describe("derivatives support (SHORT + leverage futures)", () => {
  let storage: MemoryPortfolioStorage;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
  });

  it("LONG_ONLY mode keeps current sell-without-position behavior", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      positionMode: "LONG_ONLY",
    });

    await expect(engine.sell(1, 60_000, 60_000)).rejects.toThrow(/Insufficient position/);

    await engine.buy(1, 60_000, 60_000);
    await expect(engine.sell(2, 65_000, 65_000)).rejects.toThrow(/Insufficient position/);
  });

  it("short opens a negative position without selling assets", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      positionMode: "LONG_SHORT",
    });

    const state = await engine.sell(1, 60_000, 60_000);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0]?.quantity).toBe(-1);
    expect(state.positions[0]?.avgEntry).toBe(60_000);
    // Opening fee reduces wallet; margin locked from available balance.
    expect(state.portfolio.walletBalance).toBeCloseTo(500_000 - openFee(1, 60_000), 4);
    expect(state.portfolio.marginUsed).toBe(60_000);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
    expect(state.trades[0]?.positionMode).toBe("SHORT");
  });

  it("short PnL: price down profits, price up loses", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      positionMode: "LONG_SHORT",
    });

    await engine.sell(1, 60_000, 60_000);
    const profit = await engine.getState(50_000);

    expect(profit.positions[0]?.unrealizedPnL).toBe(10_000);
    expect(profit.portfolio.unrealizedPnL).toBe(10_000);
    expect(profit.portfolio.equity).toBeCloseTo(510_000 - openFee(1, 60_000), 4);

    const loss = await engine.getState(70_000);
    expect(loss.positions[0]?.unrealizedPnL).toBe(-10_000);
    expect(loss.portfolio.equity).toBeCloseTo(490_000 - openFee(1, 60_000), 4);
  });

  it("leverage locks only margin = notional / leverage", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      positionMode: "LONG_ONLY",
      leverage: 10,
    });

    // 100 USDT margin equivalent: qty = (100 * 10) / 50_000 = 0.02
    const state = await engine.buy(0.02, 50_000, 50_000);
    expect(state.portfolio.leverage).toBe(10);
    expect(state.portfolio.marginUsed).toBe(100);
    expect(state.portfolio.walletBalance).toBeCloseTo(500_000 - openFee(0.02, 50_000), 4);
    expect(state.portfolio.cashBalance).toBeCloseTo(
      500_000 - openFee(0.02, 50_000) - 100,
      4,
    );
    expect(state.positions[0]?.positionValue).toBe(1_000);
    expect(state.trades[0]?.leverage).toBe(10);
  });

  it("risk block triggers at leverage > 125", () => {
    expect(() =>
      createPortfolioEngine(storage, new PaperBroker(), { leverage: 126 }),
    ).toThrow(RiskLimitError);

    const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 125 });
    expect(() => engine.setLeverage(126)).toThrow(/exceeds maximum/);
  });

  it("LONG buy/sell path settles realized PnL into wallet", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker());

    const afterBuy = await engine.buy(1, 60_000, 60_000);
    expect(afterBuy.positions[0]?.quantity).toBe(1);
    expect(afterBuy.portfolio.walletBalance).toBeCloseTo(500_000 - openFee(1, 60_000), 4);
    expect(afterBuy.portfolio.equity).toBeCloseTo(500_000 - openFee(1, 60_000), 4);

    const afterSell = await engine.sell(1, 70_000, 70_000);
    expect(afterSell.positions).toHaveLength(0);
    expect(afterSell.portfolio.walletBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(1, 60_000) - closeFee(1, 70_000),
      4,
    );
    expect(afterSell.portfolio.realizedPnL).toBe(10_000);
    expect(afterSell.portfolio.cashBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(1, 60_000) - closeFee(1, 70_000),
      4,
    );
  });

  it("covering a short realizes PnL", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      positionMode: "LONG_SHORT",
    });

    await engine.sell(1, 60_000, 60_000);
    const covered = await engine.buy(1, 50_000, 50_000);

    expect(covered.positions).toHaveLength(0);
    expect(covered.portfolio.realizedPnL).toBe(10_000);
    expect(covered.portfolio.walletBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(1, 60_000) - closeFee(1, 50_000),
      4,
    );
    expect(covered.portfolio.cashBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(1, 60_000) - closeFee(1, 50_000),
      4,
    );
  });

  it("Cross vs Isolated available balance differs with unrealized PnL", async () => {
    const cross = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 5,
      marginMode: "CROSS",
    });
    await cross.buy(1, 60_000, 60_000);
    const crossUp = await cross.getState(70_000);
    // margin 12k, upnl +10k, opening fee 30
    expect(crossUp.portfolio.cashBalance).toBeCloseTo(
      500_000 - openFee(1, 60_000) - 12_000 + 10_000,
      4,
    );

    const isoStorage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const isolated = createPortfolioEngine(isoStorage, new PaperBroker(), {
      leverage: 5,
      marginMode: "ISOLATED",
    });
    await isolated.buy(1, 60_000, 60_000);
    const isoUp = await isolated.getState(70_000);
    // Isolated: uPnL stays in position → available = wallet − margin
    expect(isoUp.portfolio.cashBalance).toBeCloseTo(
      500_000 - openFee(1, 60_000) - 12_000,
      4,
    );
  });
});
