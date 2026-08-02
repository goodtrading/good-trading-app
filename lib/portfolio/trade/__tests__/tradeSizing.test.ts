import { describe, expect, it } from "vitest";

import { entryMarginForPosition } from "@/lib/portfolio/futures/futuresAccounting";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { quantityFromMargin } from "@/lib/portfolio/trade/tradeEntryCalculations";
import {
  maxExecutableMarginFromAvailable,
  maxOrderMarginFromAvailable,
  roundMoneyDown,
} from "@/lib/portfolio/trade/tradeSizing";

describe("tradeSizing", () => {
  it("roundMoneyDown floors to cents", () => {
    expect(roundMoneyDown(99.999)).toBe(99.99);
    expect(roundMoneyDown(0)).toBe(0);
  });

  it("maxOrderMarginFromAvailable never exceeds available balance", () => {
    const available = 1_000;
    const price = 60_000;
    const leverage = 10;
    const margin = maxOrderMarginFromAvailable({
      availableBalance: available,
      price,
      leverage,
      symbol: PORTFOLIO_V1_SYMBOL,
    });
    expect(margin).toBeLessThanOrEqual(available);

    const qty = quantityFromMargin({ margin, leverage, price });
    expect(qty).not.toBeNull();
    const required = entryMarginForPosition(qty!, price, leverage);
    expect(required).toBeLessThanOrEqual(available + 1e-6);
  });

  it("maxExecutableMarginFromAvailable survives margin ↔ qty round-trip", () => {
    const available = 432.17;
    const price = 61_234.5;
    const leverage = 7;
    const margin = maxExecutableMarginFromAvailable({
      availableBalance: available,
      price,
      leverage,
    });
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThanOrEqual(available);

    const qty = quantityFromMargin({ margin, leverage, price });
    expect(qty).not.toBeNull();
    const required = entryMarginForPosition(qty!, price, leverage);
    expect(required).toBeLessThanOrEqual(available + 1e-6);
  });
});
