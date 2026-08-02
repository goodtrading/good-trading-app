import { describe, expect, it } from "vitest";

import {
  assertLedgerIntegrity,
  LedgerIntegrityError,
  LedgerValidationError,
  validateLedgerEntry,
} from "@/lib/cartera/ledger/LedgerEntrySchema";

describe("LedgerEntrySchema", () => {
  const validTrade = {
    id: "trade_1",
    symbol: "BTCUSDT",
    side: "BUY" as const,
    quantity: 0.01,
    price: 80000,
    timestamp: 1_700_000_000_000,
    source: "PAPER" as const,
  };

  it("validates legacy trade entries and hydrates zero fees", () => {
    const hydrated = validateLedgerEntry(validTrade) as import("@/lib/portfolio/types").Trade;
    expect(hydrated.fees.totalFee).toBe(0);
    expect(hydrated.symbol).toBe(validTrade.symbol);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() => validateLedgerEntry({ ...validTrade, extra: true })).toThrow(LedgerValidationError);
  });

  it("rejects invalid quantity", () => {
    expect(() => validateLedgerEntry({ ...validTrade, quantity: -1 })).toThrow(LedgerValidationError);
  });

  it("assertLedgerIntegrity enforces unique ids and non-negative cash", () => {
    assertLedgerIntegrity([validTrade], 10000);
    expect(() => assertLedgerIntegrity([validTrade, validTrade], 10000)).toThrow(LedgerIntegrityError);
  });

  it("assertLedgerIntegrity rejects negative wallet from realized losses", () => {
    const openShort = {
      ...validTrade,
      id: "t_open",
      side: "SELL" as const,
      quantity: 1,
      price: 100,
      timestamp: 1,
    };
    const coverLoss = {
      ...validTrade,
      id: "t_cover",
      side: "BUY" as const,
      quantity: 1,
      price: 5_000,
      timestamp: 2,
    };
    // realized = 100 - 5000 = -4900, wallet = 1000 - 4900 < 0
    expect(() => assertLedgerIntegrity([openShort, coverLoss], 1000)).toThrow(
      LedgerIntegrityError,
    );
  });

  it("assertLedgerIntegrity allows futures open that only locks margin", () => {
    const openLong = { ...validTrade, quantity: 1, price: 1_000_000 };
    expect(() => assertLedgerIntegrity([openLong], 1000)).not.toThrow();
  });
});
