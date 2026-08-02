import { describe, expect, it } from "vitest";

import { createOpenSpotPosition } from "@/lib/portfolio/spot/SpotPosition";
import { SpotPositionEngine } from "@/lib/portfolio/spot/SpotPositionEngine";
import { createSpotBalance } from "@/lib/portfolio/spot/types";

const engine = new SpotPositionEngine();
const walletId = "w_spot_pos";

function trade(
  side: "BUY" | "SELL",
  quantity: number,
  price: number,
  baseAsset = "BTC",
): Parameters<SpotPositionEngine["applyTrade"]>[1] {
  return {
    id: `t_${side}_${quantity}`,
    domain: "SPOT",
    walletId,
    baseAsset,
    quoteAsset: "USDT",
    side,
    quantity,
    price,
    quoteQuantity: quantity * price,
    timestamp: Date.now(),
  };
}

describe("SpotPositionEngine", () => {
  it("BUY opens position and recalculates weighted average", () => {
    let positions = engine.applyTrade([], trade("BUY", 1, 50_000));
    expect(positions).toHaveLength(1);
    expect(positions[0]!.quantity).toBe(1);
    expect(positions[0]!.averageEntry).toBe(50_000);
    expect(positions[0]!.status).toBe("OPEN");

    positions = engine.applyTrade(positions, trade("BUY", 1, 60_000));
    expect(positions[0]!.quantity).toBe(2);
    expect(positions[0]!.averageEntry).toBe(55_000);
  });

  it("SELL partial reduces quantity, adds realized PnL, keeps average", () => {
    const open = engine.applyTrade([], trade("BUY", 2, 50_000));
    const after = engine.applyTrade(open, trade("SELL", 0.5, 60_000));

    expect(after[0]!.quantity).toBe(1.5);
    expect(after[0]!.averageEntry).toBe(50_000);
    expect(after[0]!.realizedPnL).toBe((60_000 - 50_000) * 0.5);
    expect(after[0]!.status).toBe("OPEN");
  });

  it("SELL total closes position", () => {
    const open = engine.applyTrade([], trade("BUY", 1, 50_000));
    const after = engine.applyTrade(open, trade("SELL", 1, 55_000));

    expect(after[0]!.quantity).toBe(0);
    expect(after[0]!.status).toBe("CLOSED");
    expect(after[0]!.realizedPnL).toBe(5_000);
  });

  it("SELL leaving dust quantity closes position", () => {
    const open = engine.applyTrade([], trade("BUY", 0.000019, 50_000));
    const after = engine.applyTrade(
      open,
      trade("SELL", 0.00001, 50_000),
    );

    expect(after[0]!.quantity).toBe(0);
    expect(after[0]!.status).toBe("CLOSED");
  });

  it("migrateFromLedger builds open positions from balances and trade avg", () => {
    const balances = [
      createSpotBalance("USDT", 5_000, 0),
      createSpotBalance("BTC", 0.5, 0),
    ];
    const trades = [
      trade("BUY", 1, 40_000),
      trade("SELL", 0.5, 50_000),
    ];

    const positions = engine.migrateFromLedger(walletId, balances, trades);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.quantity).toBe(0.5);
    expect(positions[0]!.averageEntry).toBe(40_000);
    expect(positions[0]!.status).toBe("OPEN");
  });

  it("listOpen filters CLOSED and zero quantity", () => {
    const closed = createOpenSpotPosition({
      walletId,
      symbol: "ETHUSDT",
      baseAsset: "ETH",
      quoteAsset: "USDT",
      quantity: 0,
      averageEntry: 3_000,
    });
    closed.status = "CLOSED";

    const open = createOpenSpotPosition({
      walletId,
      symbol: "BTCUSDT",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      quantity: 1,
      averageEntry: 50_000,
    });

    const visible = [open, closed].filter(
      (p) => p.status === "OPEN" && p.quantity > 0,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]!.symbol).toBe("BTCUSDT");
  });
});
