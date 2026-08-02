import { describe, expect, it } from "vitest";

import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { buildPerpPositionPreview } from "@/lib/portfolio/futures/PerpPositionPreview";
import { ZERO_FUNDING_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import {
  marginFromPercent,
  percentFromMargin,
  quantityFromMargin,
} from "@/lib/portfolio/trade/tradeEntryCalculations";
import { buildTradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import { validateTradeEntry } from "@/lib/portfolio/trade/tradeEntryValidation";

const MARK = 50_000;

function emptyPerpSnapshot() {
  return buildPortfolioAccountSnapshot({
    accountId: "acc",
    markPrice: MARK,
    spotWallet: {
      accountId: "acc",
      usdtFree: 0,
      usdtLocked: 0,
      usdtTotal: 0,
      balances: [],
    },
    spotPositions: [],
    perpWallet: {
      accountId: "acc",
      initialCashBalance: 1_000,
      walletCash: 1_000,
      walletBalance: 1_000,
      availableBalance: 1_000,
      equity: 1_000,
      marginUsed: 0,
      realizedPnL: 0,
      unrealizedPnL: 0,
      feesPaid: 0,
      feesToday: 0,
      openingFees: 0,
      closingFees: 0,
      fundingFees: 0,
      totalFees: 0,
      estimatedOpeningFee: 0,
      estimatedClosingFee: 0,
      financialEvents: [],
      fundingPaid: 0,
      rebates: 0,
      insurance: 0,
      adl: 0,
      manualAdjustments: 0,
      ...ZERO_FUNDING_SNAPSHOT,
      ...ZERO_REDUCE_ONLY_SNAPSHOT,
      ...ZERO_POST_ONLY_SNAPSHOT,
      ...ZERO_MAKER_TAKER_SNAPSHOT,
    },
    perpPositions: [],
  });
}

describe("Classic trade entry — margin system", () => {
  it("builds a complete TradeExecutionRequest including risk fields", () => {
    const request = buildTradeExecutionRequest({
      walletId: "acc_1",
      direction: "LONG",
      orderType: "LIMIT",
      marginMode: "ISOLATED",
      leverage: 5,
      quantity: 0.1,
      margin: 1000,
      price: 50_000,
      marketPrice: 60_000,
      tpSlEnabled: true,
      reduceOnlyEnabled: true,
      takeProfitPrice: 70_000,
      stopLossPrice: 45_000,
    });

    expect(request.walletId).toBe("acc_1");
    expect(request.domain).toBe("PERP");
    expect(request.margin).toBe(1000);
    expect(request.marginMode).toBe("ISOLATED");
    expect(request.leverage).toBe(5);
    expect(request.tpSlEnabled).toBe(true);
    expect(request.reduceOnlyEnabled).toBe(true);
  });


  it("validates margin against available balance", () => {
    const result = validateTradeEntry({
      margin: 250,
      entryPrice: 60_000,
      orderType: "MARKET",
      leverage: 5,
      marketPrice: 60_000,
      cashBalance: 100,
    });

    expect(result.canExecute).toBe(false);
    expect(result.canExecuteLong).toBe(false);
    expect(result.canExecuteShort).toBe(false);
  });

  it("rejects margin <= 0", () => {
    const result = validateTradeEntry({
      margin: 0,
      entryPrice: 60_000,
      orderType: "MARKET",
      leverage: 1,
      marketPrice: 60_000,
      cashBalance: 1000,
    });

    expect(result.canExecute).toBe(false);
    expect(result.errors.margin).toBeTruthy();
  });

  it("syncs margin ↔ percent and derives quantity", () => {
    const balance = 1000;
    const margin = marginFromPercent(25, balance);
    expect(margin).toBe(250);
    expect(percentFromMargin(250, balance)).toBe(25);

    // positionValue = 250 * 20 = 5000, qty = 5000 / 50_000 = 0.1
    const qty = quantityFromMargin({ margin: 250, leverage: 20, price: MARK });
    expect(qty).toBe(0.1);

    const preview = buildPerpPositionPreview({
      direction: "LONG",
      margin: 250,
      entryPrice: MARK,
      markPrice: MARK,
      leverage: 20,
      marginMode: "CROSS",
      accountSnapshot: emptyPerpSnapshot(),
    })!;

    expect(preview.positionValue).toBeCloseTo(0.1 * MARK, 2);
    expect(preview.entryMargin).toBe(250);
    expect(preview.quantity).toBeCloseTo(0.1, 4);
    expect(preview.liquidationPrice).toBeCloseTo(37_714, -1);
    expect(preview.availableBalance).toBeCloseTo(747.5, 2);
    expect(preview.estimatedOpeningFee).toBeCloseTo(2.5, 4);
  });

  it("validates missing market price", () => {
    const result = validateTradeEntry({
      margin: 100,
      entryPrice: null,
      orderType: "MARKET",
      leverage: 1,
      marketPrice: 0,
      cashBalance: 1000,
    });

    expect(result.canExecute).toBe(false);
    expect(result.errors.marketPrice).toBeTruthy();
  });

  it("allows SPOT sell notional above USDT cash when inventory suffices", () => {
    const result = validateTradeEntry({
      margin: 5_000,
      entryPrice: 50_000,
      orderType: "MARKET",
      leverage: 1,
      marketPrice: 50_000,
      cashBalance: 100,
      tradingMode: "SPOT",
      inventoryBalance: 0.2,
      derivedQuantity: 0.1,
    });

    expect(result.canExecuteShort).toBe(true);
    expect(result.canExecuteLong).toBe(false);
  });
});
