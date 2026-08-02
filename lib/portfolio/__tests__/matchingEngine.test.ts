import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { closeFee, openFee } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

describe("MatchingEngine via PortfolioEngine", () => {
  let storage: MemoryPortfolioStorage;
  let engine: ReturnType<typeof createPortfolioEngine>;

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    engine = createPortfolioEngine(storage, new PaperBroker());
  });

  it("MARKET buy still fills immediately and writes a trade", async () => {
    const state = await engine.buy(1, 60_000, 60_000);
    expect(state.trades).toHaveLength(1);
    expect(state.portfolio.cashBalance).toBeCloseTo(500_000 - openFee(1, 60_000) - 60_000, 4);
  });

  it("LIMIT buy stays open until market price drops to limit", async () => {
    const orderEngine = (engine as unknown as { orderEngine: { createLimitOrder: Function } })
      .orderEngine;

    const created = await orderEngine.createLimitOrder({
      side: "BUY",
      quantity: 1,
      price: 55_000,
    });

    expect(created.trade).toBeNull();
    expect(created.order.status).toBe("OPEN");

    const before = await engine.getState(60_000);
    expect(before.trades).toHaveLength(0);

    const noFill = await engine.onPriceUpdate(56_000);
    expect(noFill.trades).toHaveLength(0);

    const filled = await engine.onPriceUpdate(55_000);
    expect(filled.trades).toHaveLength(1);
    expect(filled.trades[0]?.side).toBe("BUY");
    expect(filled.trades[0]?.price).toBe(55_000);
    expect(filled.portfolio.cashBalance).toBeCloseTo(
      500_000 - openFee(1, 55_000) - 55_000,
      4,
    );

    const idle = await engine.onPriceUpdate(50_000);
    expect(idle.trades).toHaveLength(1);
  });

  it("LIMIT sell fills when market price rises to limit", async () => {
    await engine.buy(1, 60_000, 60_000);

    const orderEngine = (engine as unknown as { orderEngine: { createLimitOrder: Function } })
      .orderEngine;

    await orderEngine.createLimitOrder({
      side: "SELL",
      quantity: 1,
      price: 70_000,
    });

    const noFill = await engine.onPriceUpdate(69_000);
    expect(noFill.trades).toHaveLength(1);

    const filled = await engine.onPriceUpdate(70_000);
    expect(filled.trades).toHaveLength(2);
    expect(filled.trades[1]?.side).toBe("SELL");
    expect(filled.trades[1]?.price).toBe(70_000);
    expect(filled.positions).toHaveLength(0);
    expect(filled.portfolio.cashBalance).toBeCloseTo(
      500_000 + 10_000 - openFee(1, 60_000) - closeFee(1, 70_000),
      4,
    );
  });
});
