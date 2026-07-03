import { z } from "zod";

import type { Trade } from "@/lib/portfolio/types";

/** Ledger entry discriminator — aligned with DOMAIN_MODEL v1.0 union. */
export const LEDGER_ENTRY_TYPES = [
  "TradeExecution",
  "CashMovement",
  "CorporateAction",
  "CashAccrual",
  "PositionCheckpoint",
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

const moneySchema = z
  .object({
    amount: z.number().finite(),
    currency: z.string().length(3),
  })
  .strict();

const baseLedgerEntrySchema = z
  .object({
    id: z.string().min(1),
    entryType: z.enum(LEDGER_ENTRY_TYPES),
    sequence: z.number().int().positive(),
    timestamp: z.number().int().positive(),
    walletId: z.string().min(1).optional(),
    externalRef: z.string().min(1).optional(),
    correlationId: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .strict();

export const tradeExecutionEntrySchema = baseLedgerEntrySchema
  .extend({
    entryType: z.literal("TradeExecution"),
    instrumentId: z.string().min(1),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().positive().finite(),
    price: moneySchema,
    fees: moneySchema.optional(),
    fillId: z.string().min(1).optional(),
    orderId: z.string().min(1).optional(),
    brokerId: z.string().min(1).optional(),
    correctsEntryId: z.string().min(1).optional(),
    source: z.enum(["PAPER", "BINANCE", "BINGX"]).optional(),
  })
  .strict();

export const cashMovementEntrySchema = baseLedgerEntrySchema
  .extend({
    entryType: z.literal("CashMovement"),
    movementType: z.enum(["DEPOSIT", "WITHDRAWAL", "INTERNAL_TRANSFER", "FEE_CHARGE"]),
    amount: moneySchema,
    counterpartyWalletId: z.string().min(1).optional(),
  })
  .strict();

export const corporateActionEntrySchema = baseLedgerEntrySchema
  .extend({
    entryType: z.literal("CorporateAction"),
    actionType: z.enum([
      "DIVIDEND",
      "SPLIT",
      "REVERSE_SPLIT",
      "AIRDROP",
      "MERGER",
      "SPINOFF",
    ]),
    instrumentId: z.string().min(1),
    quantityDelta: z.number().finite().optional(),
    cashAmount: moneySchema.optional(),
    ratio: z.number().positive().finite().optional(),
    exDate: z.number().int().positive(),
    brokerId: z.string().min(1).optional(),
  })
  .strict();

export const cashAccrualEntrySchema = baseLedgerEntrySchema
  .extend({
    entryType: z.literal("CashAccrual"),
    accrualType: z.enum(["FUNDING", "INTEREST", "STAKING_REWARD", "REBATE"]),
    amount: moneySchema,
    instrumentId: z.string().min(1).optional(),
    periodStart: z.number().int().positive(),
    periodEnd: z.number().int().positive(),
    brokerId: z.string().min(1).optional(),
  })
  .strict();

export const positionCheckpointEntrySchema = baseLedgerEntrySchema
  .extend({
    entryType: z.literal("PositionCheckpoint"),
    instrumentId: z.string().min(1),
    quantity: z.number().finite().nonnegative(),
    costBasis: moneySchema,
    asOfSequence: z.number().int().positive(),
  })
  .strict();

export const ledgerEntrySchema = z.discriminatedUnion("entryType", [
  tradeExecutionEntrySchema,
  cashMovementEntrySchema,
  corporateActionEntrySchema,
  cashAccrualEntrySchema,
  positionCheckpointEntrySchema,
]);

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type TradeExecutionEntry = z.infer<typeof tradeExecutionEntrySchema>;

/** Legacy persisted trade shape (pre-entryType migration). */
export const legacyTradeSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().positive().finite(),
    price: z.number().positive().finite(),
    timestamp: z.number().int().positive(),
    source: z.enum(["PAPER", "BINANCE", "BINGX"]),
    fees: z.number().finite().nonnegative().optional(),
  })
  .strict();

export class LedgerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerValidationError";
  }
}

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIntegrityError";
  }
}

export function tradeToTradeExecutionEntry(trade: Trade, sequence: number): TradeExecutionEntry {
  const normalized = {
    id: trade.id,
    entryType: "TradeExecution" as const,
    sequence,
    timestamp: trade.timestamp,
    instrumentId: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    price: { amount: trade.price, currency: "USD" },
    ...(trade.fees != null
      ? { fees: { amount: trade.fees, currency: "USD" } }
      : {}),
    source: trade.source,
    externalRef: trade.id,
  };

  return tradeExecutionEntrySchema.parse(normalized);
}

export function validateLedgerEntry(entry: unknown): LedgerEntry | Trade {
  const legacy = legacyTradeSchema.safeParse(entry);
  if (legacy.success) {
    return legacy.data;
  }

  const parsed = ledgerEntrySchema.safeParse(entry);
  if (parsed.success) {
    return parsed.data;
  }

  throw new LedgerValidationError(
    `Invalid ledger entry: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
  );
}

export function assertLedgerIntegrity(
  entries: unknown[],
  initialCashBalance: number,
): void {
  if (!Array.isArray(entries)) {
    throw new LedgerIntegrityError("Ledger entries must be an array");
  }

  const validated: Array<Trade | LedgerEntry> = [];
  const seenIds = new Set<string>();
  const seenExternalRefs = new Set<string>();
  const seenSequences = new Set<number>();

  for (const raw of entries) {
    const entry = validateLedgerEntry(raw);

    if (seenIds.has(entry.id)) {
      throw new LedgerIntegrityError(`Duplicate ledger entry id: ${entry.id}`);
    }
    seenIds.add(entry.id);

    if ("entryType" in entry && entry.entryType === "TradeExecution") {
      if (seenSequences.has(entry.sequence)) {
        throw new LedgerIntegrityError(`Duplicate ledger sequence: ${entry.sequence}`);
      }
      seenSequences.add(entry.sequence);

      if (entry.externalRef) {
        if (seenExternalRefs.has(entry.externalRef)) {
          throw new LedgerIntegrityError(`Duplicate externalRef: ${entry.externalRef}`);
        }
        seenExternalRefs.add(entry.externalRef);
      }
    }

    if (!("entryType" in entry)) {
      if (seenExternalRefs.has(entry.id)) {
        throw new LedgerIntegrityError(`Duplicate trade id used as externalRef: ${entry.id}`);
      }
      seenExternalRefs.add(entry.id);
    }

    validated.push(entry);
  }

  const legacyTrades = validated.filter((entry): entry is Trade => !("entryType" in entry));
  if (legacyTrades.length > 0) {
    const cash = legacyTrades.reduce((balance, trade) => {
      const notional = trade.quantity * trade.price + (trade.fees ?? 0);
      return trade.side === "BUY" ? balance - notional : balance + notional;
    }, initialCashBalance);

    if (cash < -0.000_001) {
      throw new LedgerIntegrityError(
        `Ledger cash invariant violated: balance ${cash.toFixed(4)} < 0`,
      );
    }
  }
}
