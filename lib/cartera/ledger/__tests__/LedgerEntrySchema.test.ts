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

  it("validates legacy trade entries", () => {
    expect(validateLedgerEntry(validTrade)).toEqual(validTrade);
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

  it("assertLedgerIntegrity rejects negative cash balance", () => {
    const expensiveBuy = { ...validTrade, quantity: 1, price: 1_000_000 };
    expect(() => assertLedgerIntegrity([expensiveBuy], 1000)).toThrow(LedgerIntegrityError);
  });
});
