import { describe, expect, it, vi } from "vitest";

import { createEmptySpotLedgerState } from "@/lib/portfolio/spot/types";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";

describe("spotLedgerStore", () => {
  it("publishes ledger, orders, and trades slices independently", () => {
    const listener = vi.fn();
    const unsub = spotLedgerStore.subscribe(listener);

    const base = createEmptySpotLedgerState("w1", 10_000);
    spotLedgerStore.sync("w1", base);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(spotLedgerStore.getBalancesSnapshot("w1")).toHaveLength(1);

    spotLedgerStore.publish(
      "w1",
      {
        ...base,
        trades: [
          {
            id: "t1",
            domain: "SPOT",
            walletId: "w1",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            side: "BUY",
            quantity: 0.1,
            price: 50_000,
            quoteQuantity: 5_000,
            timestamp: 1,
          },
        ],
      },
      ["trades"],
    );
    expect(listener).toHaveBeenCalledTimes(2);
    expect(spotLedgerStore.getTradesSnapshot("w1")).toHaveLength(1);

    unsub();
  });

  it("getOpenOrders returns a stable reference until orders publish", () => {
    const base = createEmptySpotLedgerState("w_open", 10_000);
    spotLedgerStore.sync("w_open", {
      ...base,
      orders: [
        {
          id: "o1",
          domain: "SPOT",
          walletId: "w_open",
          baseAsset: "BTC",
          quoteAsset: "USDT",
          side: "BUY",
          orderType: "LIMIT",
          status: "PENDING",
          quantity: 0.1,
          filledQuantity: 0,
          triggerPrice: 50_000,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const first = spotLedgerStore.getOpenOrders("w_open");
    const second = spotLedgerStore.getOpenOrders("w_open");
    expect(first).toBe(second);
    expect(first).toHaveLength(1);

    spotLedgerStore.publish(
      "w_open",
      {
        ...base,
        orders: [
          {
            id: "o1",
            domain: "SPOT",
            walletId: "w_open",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            side: "BUY",
            orderType: "LIMIT",
            status: "FILLED",
            quantity: 0.1,
            filledQuantity: 0.1,
            triggerPrice: 50_000,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
      ["orders"],
    );

    const afterFill = spotLedgerStore.getOpenOrders("w_open");
    expect(afterFill).not.toBe(first);
    expect(afterFill).toHaveLength(0);
  });

  it("publishes positions slice independently", () => {
    const listener = vi.fn();
    const unsub = spotLedgerStore.subscribePositions(listener);

    spotLedgerStore.publishPositions("w2", [
      {
        id: "p1",
        walletId: "w2",
        domain: "SPOT",
        symbol: "BTCUSDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        quantity: 0.1,
        averageEntry: 50_000,
        realizedPnL: 0,
        status: "OPEN",
        createdAt: 1,
        updatedAt: 1,
        marketPrice: 51_000,
        marketValue: 5_100,
        unrealizedPnL: 100,
        unrealizedPnLPercent: 2,
      },
    ]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(spotLedgerStore.getOpenPositionsSnapshot("w2")).toHaveLength(1);
    unsub();
  });
});
