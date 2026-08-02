import { describe, expect, it } from "vitest";

import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  buildPortfolioAccountSnapshot,
} from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import { formatMarginInput } from "@/lib/portfolio/trade/tradeEntryCalculations";
import { parsePositiveNumber } from "@/lib/portfolio/accounts/format";
import {
  clampToPosition,
  closeQuantityFromPercent,
  formatCloseQuantity,
  isEffectivelyZero,
  isFullClose,
  maxCloseQuantity,
  maxPerpExecutableMargin,
  maxSpotSellQuantity,
  normalizeQuantity,
  resolveCanonicalCloseQuantity,
  roundToStep,
  validateCloseQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import { dustEpsilon, getSymbolRules } from "@/lib/portfolio/symbols/symbolRules";

const SYMBOL = PORTFOLIO_V1_SYMBOL;

function parseCloseInput(_symbol: string, input: string): number | null {
  return parsePositiveNumber(input);
}

describe("PositionSizing", () => {
  it("normalizeQuantity rounds down to step and collapses dust", () => {
    expect(normalizeQuantity(SYMBOL, 0.036512345)).toBe(0.03651);
    expect(normalizeQuantity(SYMBOL, dustEpsilon(SYMBOL) / 2)).toBe(0);
  });

  it("isEffectivelyZero uses minQty and epsilon from stepSize", () => {
    expect(isEffectivelyZero(SYMBOL, 0.000001)).toBe(true);
    expect(isEffectivelyZero(SYMBOL, 0.0001)).toBe(false);
  });

  it("roundToStep floors to lot step", () => {
    expect(roundToStep(SYMBOL, 0.123456789)).toBe(0.12345);
  });

  it("clampToPosition never exceeds position quantity", () => {
    expect(clampToPosition(SYMBOL, 1, 0.0365)).toBeCloseTo(0.0365, 8);
    expect(clampToPosition(SYMBOL, 0.01, 0.0365)).toBeCloseTo(0.01, 8);
  });

  it("closeQuantityFromPercent uses position at 100%", () => {
    expect(closeQuantityFromPercent(SYMBOL, 0.0365, 100)).toBeCloseTo(0.0365, 8);
    expect(closeQuantityFromPercent(SYMBOL, 0.0365, 50)).toBeCloseTo(0.01825, 8);
  });

  it("resolveCanonicalCloseQuantity normalizes position size", () => {
    expect(
      resolveCanonicalCloseQuantity({ symbol: SYMBOL, quantity: 0.036512345 }),
    ).toBe(0.03651);
    expect(
      resolveCanonicalCloseQuantity({ symbol: SYMBOL, quantity: dustEpsilon(SYMBOL) / 2 }),
    ).toBe(0);
  });

  it("maxSpotSellQuantity delegates to resolveCanonicalCloseQuantity", () => {
    expect(maxSpotSellQuantity(SYMBOL, 0.0365)).toBeCloseTo(0.0365, 8);
  });

  it("isFullClose detects full position exit", () => {
    expect(isFullClose(SYMBOL, 0.0365, 0.0365)).toBe(true);
    expect(isFullClose(SYMBOL, 0.01, 0.0365)).toBe(false);
  });

  it("maxPerpExecutableMargin stays within available balance", () => {
    const margin = maxPerpExecutableMargin({
      availableBalance: 432.17,
      price: 61_234.5,
      leverage: 7,
      symbol: SYMBOL,
    });
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThanOrEqual(432.17);
  });
});

describe("validateCloseQuantity", () => {
  const maxCases = [
    { symbol: "BTCUSDT", rawQty: 0.036550 },
    { symbol: "ETHUSDT", rawQty: 1.23456 },
    { symbol: "SOLUSDT", rawQty: 12.3456 },
    { symbol: "XRPUSDT", rawQty: 1500.7 },
  ] as const;

  it.each(maxCases)("MAX $symbol never exceeds after formatCloseQuantity", ({
    symbol,
    rawQty,
  }) => {
    const position = { symbol, quantity: rawQty };
    const canonical = maxCloseQuantity(position);
    const input = formatCloseQuantity(symbol, canonical);
    const parsed = parseCloseInput(symbol, input);
    const validation = validateCloseQuantity(position, parsed);

    expect({ canonical, input, parsed, validation }).toMatchObject({
      validation: {
        valid: true,
        isFullClose: true,
        exceedsPosition: false,
      },
    });
    expect(validation.normalizedQuantity).toBe(canonical);
    expect(validation.executableQuantity).toBe(canonical);
  });

  it("accepts quantity exactly equal to canonical close", () => {
    const position = { symbol: SYMBOL, quantity: 0.036512345 };
    const canonical = resolveCanonicalCloseQuantity(position);
    const validation = validateCloseQuantity(position, canonical);

    expect(validation.valid).toBe(true);
    expect(validation.isFullClose).toBe(true);
    expect(validation.exceedsPosition).toBe(false);
    expect(validation.normalizedQuantity).toBe(canonical);
  });

  it("rejects quantity one step above canonical close", () => {
    const position = { symbol: SYMBOL, quantity: 0.0365 };
    const canonical = resolveCanonicalCloseQuantity(position);
    const { stepSize } = getSymbolRules(SYMBOL);
    const oneStepOver = canonical + stepSize;
    const validation = validateCloseQuantity(position, oneStepOver);

    expect(validation.valid).toBe(false);
    expect(validation.exceedsPosition).toBe(true);
    expect(validation.isFullClose).toBe(false);
  });

  it("rejects quantity above position", () => {
    const position = { symbol: SYMBOL, quantity: 0.0365 };
    const validation = validateCloseQuantity(position, 1);

    expect(validation.valid).toBe(false);
    expect(validation.exceedsPosition).toBe(true);
  });

  it("detects partial close below canonical position", () => {
    const position = { symbol: SYMBOL, quantity: 0.0365 };
    const validation = validateCloseQuantity(position, 0.01);

    expect(validation.valid).toBe(true);
    expect(validation.isPartialClose).toBe(true);
    expect(validation.isFullClose).toBe(false);
    expect(validation.exceedsPosition).toBe(false);
  });

  it("formatMarginInput can exceed canonical — formatCloseQuantity does not", () => {
    const position = { symbol: SYMBOL, quantity: 0.036556 };
    const canonical = maxCloseQuantity(position);

    const legacyInput = formatMarginInput(position.quantity);
    const legacyParsed = parseCloseInput(SYMBOL, legacyInput);
    const legacyValidation = validateCloseQuantity(position, legacyParsed);

    const closeInput = formatCloseQuantity(SYMBOL, canonical);
    const closeParsed = parseCloseInput(SYMBOL, closeInput);
    const closeValidation = validateCloseQuantity(position, closeParsed);

    expect(legacyValidation.exceedsPosition).toBe(true);
    expect(closeValidation.valid).toBe(true);
    expect(closeValidation.isFullClose).toBe(true);
  });

  it("formatCloseQuantity preserves integer quantities (XRP)", () => {
    expect(formatCloseQuantity("XRPUSDT", 1500)).toBe("1500");
    expect(formatCloseQuantity("XRPUSDT", 150)).toBe("150");
  });
});

describe("PortfolioAccountSnapshot", () => {
  const spotPosition: SpotPositionLive = {
    id: "p1",
    walletId: "acc1",
    domain: "SPOT",
    symbol: SYMBOL,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    quantity: 0.1,
    averageEntry: 50_000,
    realizedPnL: 200,
    status: "OPEN",
    createdAt: 0,
    updatedAt: 0,
    marketPrice: 60_000,
    marketValue: 6_000,
    unrealizedPnL: 1_000,
    unrealizedPnLPercent: 20,
  };

  it("builds spot walletBalance and equity separately", () => {
    const snapshot = buildPortfolioAccountSnapshot({
      accountId: "acc1",
      markPrice: 60_000,
      spotWallet: {
        accountId: "acc1",
        usdtFree: 4_000,
        usdtLocked: 0,
        usdtTotal: 4_000,
        balances: [
          { asset: "USDT", free: 4_000, locked: 0, total: 4_000 },
          { asset: "BTC", free: 0.1, locked: 0, total: 0.1 },
        ],
      },
      spotPositions: [spotPosition],
      perpWallet: null,
      perpPositions: [],
    });

    expect(snapshot.spot.walletBalance).toBe(4_200);
    expect(snapshot.spot.equity).toBe(5_200);
    expect(snapshot.spot.availableBalance).toBe(4_000);
    expect(snapshot.spot.positionValue).toBe(6_000);
    expect(snapshot.sizing.maxSpotSellQuantity(SYMBOL)).toBeCloseTo(0.1, 8);
  });

  it("filters dust from spot inventory", () => {
    const dustPosition: SpotPositionLive = {
      ...spotPosition,
      quantity: dustEpsilon(SYMBOL) / 4,
      marketValue: 0,
      unrealizedPnL: 0,
    };
    const snapshot = buildPortfolioAccountSnapshot({
      accountId: "acc1",
      markPrice: 60_000,
      spotWallet: {
        accountId: "acc1",
        usdtFree: 10_000,
        usdtLocked: 0,
        usdtTotal: 10_000,
        balances: [{ asset: "USDT", free: 10_000, locked: 0, total: 10_000 }],
      },
      spotPositions: [dustPosition],
      perpWallet: null,
      perpPositions: [],
    });

    expect(snapshot.spot.spotInventory).toHaveLength(0);
  });
});
