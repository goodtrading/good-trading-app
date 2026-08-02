import { describe, expect, it } from "vitest";

import {
  computeAccountMarginRatio,
  computeAvailableBalance,
  computeEquityAtRisk,
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
  isLiquidationTriggered,
} from "@/lib/portfolio/futures/MarginModel";
import { entryMarginForPosition } from "@/lib/portfolio/futures/futuresAccounting";

const MARK = 60_000;
const WALLET = 500_000;

describe("MarginModel", () => {
  it("computePositionMarginRatio uses position equity denominator", () => {
    const entryMargin = 6_000;
    const uPnL = 2_000;
    const maintenance = 300;
    const ratio = computePositionMarginRatio({
      maintenanceMargin: maintenance,
      entryMargin,
      unrealizedPnL: uPnL,
    });
    expect(ratio).toBeCloseTo((maintenance / (entryMargin + uPnL)) * 100, 2);
  });

  it("computeAccountMarginRatio uses account equity denominator", () => {
    const ratio = computeAccountMarginRatio({
      maintenanceMarginTotal: 300,
      accountEquity: 502_000,
    });
    expect(ratio).toBeCloseTo((300 / 502_000) * 100, 4);
  });

  it("position and account ratios differ with same maintenance", () => {
    const position = computePositionMarginRatio({
      maintenanceMargin: 300,
      entryMargin: 6_000,
      unrealizedPnL: 0,
    });
    const account = computeAccountMarginRatio({
      maintenanceMarginTotal: 300,
      accountEquity: 500_000,
    });
    expect(position).toBeGreaterThan(account);
  });

  it("cross liquidation price is further from entry than isolated for long", () => {
    const qty = 1;
    const entryMargin = entryMarginForPosition(qty, MARK, 10);
    const isolated = computeLiquidationState({
      quantity: qty,
      avgEntry: MARK,
      entryMargin,
      markPrice: MARK,
      leverage: 10,
      marginMode: "ISOLATED",
      walletBalance: 0,
    });
    const cross = computeLiquidationState({
      quantity: qty,
      avgEntry: MARK,
      entryMargin,
      markPrice: MARK,
      leverage: 10,
      marginMode: "CROSS",
      walletBalance: 10_000,
    });
    expect(isolated.liquidationPrice).not.toBeNull();
    expect(cross.liquidationPrice).not.toBeNull();
    expect(cross.liquidationPrice!).toBeLessThan(isolated.liquidationPrice!);
  });

  it("computeEquityAtRisk differs by margin mode", () => {
    const isolated = computeEquityAtRisk({
      marginMode: "ISOLATED",
      entryMargin: 6_000,
      unrealizedPnL: 1_000,
      accountEquity: 501_000,
    });
    const cross = computeEquityAtRisk({
      marginMode: "CROSS",
      entryMargin: 6_000,
      unrealizedPnL: 1_000,
      accountEquity: 501_000,
    });
    expect(isolated).toBe(7_000);
    expect(cross).toBe(501_000);
  });

  it("computeAvailableBalance cross includes uPnL", () => {
    expect(
      computeAvailableBalance({
        walletBalance: WALLET,
        marginUsed: 6_000,
        unrealizedPnL: 10_000,
        marginMode: "CROSS",
      }),
    ).toBe(WALLET - 6_000 + 10_000);
    expect(
      computeAvailableBalance({
        walletBalance: WALLET,
        marginUsed: 6_000,
        unrealizedPnL: 10_000,
        marginMode: "ISOLATED",
      }),
    ).toBe(WALLET - 6_000);
  });

  it("computeWalletState aggregates account metrics", () => {
    const wallet = computeWalletState({
      walletBalance: WALLET,
      marginUsed: 6_000,
      unrealizedPnL: 0,
      maintenanceMarginTotal: 300,
      marginMode: "CROSS",
    });
    expect(wallet.equity).toBe(WALLET);
    expect(wallet.availableBalance).toBe(WALLET - 6_000);
    expect(wallet.lockedFunds).toBe(6_000);
    expect(wallet.accountMarginRatio).toBeCloseTo((300 / WALLET) * 100, 4);
  });

  it("isLiquidationTriggered matches equity breach", () => {
    expect(
      isLiquidationTriggered({
        quantity: 1,
        entryMargin: 6_000,
        maintenanceMargin: 7_000,
        unrealizedPnL: -500,
        marginMode: "ISOLATED",
        accountEquity: 500_000,
      }),
    ).toBe(true);
  });
});
