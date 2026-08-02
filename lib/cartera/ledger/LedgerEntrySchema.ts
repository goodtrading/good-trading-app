import { z } from "zod";

import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import { hydrateTradeFees } from "@/lib/portfolio/fees/hydrateTradeFees";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
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

const feeBreakdownSchema = z
  .object({
    makerFee: z.number().finite().nonnegative(),
    takerFee: z.number().finite().nonnegative(),
    openingFee: z.number().finite().nonnegative(),
    closingFee: z.number().finite().nonnegative(),
    fundingFee: z.number().finite().nonnegative(),
    totalFee: z.number().finite().nonnegative(),
    currency: z.string().min(3),
    feeModelVersion: z.string().min(1),
  })
  .strict();

const tradeFeeRecordSchema = z
  .object({
    openingFee: z.number().finite().nonnegative(),
    closingFee: z.number().finite().nonnegative(),
    fundingFee: z.number().finite().nonnegative(),
    totalFee: z.number().finite().nonnegative(),
    feeCurrency: z.string().min(3),
    feeModelVersion: z.string().min(1),
    breakdown: feeBreakdownSchema,
  })
  .strict();

export { feeBreakdownSchema, tradeFeeRecordSchema };

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
    /** Legacy scalar or full fee record — hydrated on read. */
    fees: z
      .union([tradeFeeRecordSchema, z.number().finite().nonnegative()])
      .optional(),
    leverage: z.number().positive().finite().optional(),
    positionMode: z.enum(["LONG", "SHORT"]).optional(),
    positionSide: z.enum(["LONG", "SHORT"]).optional(),
    marginMode: z.enum(["CROSS", "ISOLATED"]).optional(),
    liquidation: z.boolean().optional(),
    reduceOnly: z.boolean().optional(),
    postOnly: z.boolean().optional(),
    executionLiquidity: z.enum(["MAKER", "TAKER", "UNKNOWN"]).optional(),
    triggerReason: z.enum(["TAKE_PROFIT", "STOP_LOSS", "MANUAL", "TRAILING_STOP"]).optional(),
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
  const hydrated = hydrateTradeFees(trade);
  const normalized = {
    id: hydrated.id,
    entryType: "TradeExecution" as const,
    sequence,
    timestamp: hydrated.timestamp,
    instrumentId: hydrated.symbol,
    side: hydrated.side,
    quantity: hydrated.quantity,
    price: { amount: hydrated.price, currency: "USD" },
    fees: { amount: hydrated.fees.totalFee, currency: "USD" },
    source: hydrated.source,
    externalRef: hydrated.id,
  };

  return tradeExecutionEntrySchema.parse(normalized);
}

function legacyEntryToTrade(data: z.infer<typeof legacyTradeSchema>): Trade {
  const { fees: rawFees, ...rest } = data;
  const trade = {
    ...rest,
    fees: createZeroTradeFees(),
  } as Trade;
  if (rawFees != null && typeof rawFees === "object") {
    trade.fees = rawFees;
  }
  return hydrateTradeFees(trade);
}

export function validateLedgerEntry(entry: unknown): LedgerEntry | Trade {
  const legacy = legacyTradeSchema.safeParse(entry);
  if (legacy.success) {
    return legacyEntryToTrade(legacy.data);
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
  financialEvents?: import("@/lib/portfolio/financial/types").FinancialEvent[],
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
    // Futures wallet = deposit + realized PnL (opens do not spend notional).
    let quantity = 0;
    let costBasis = 0;
    let realizedPnL = 0;

    const sorted = [...legacyTrades].sort((a, b) => a.timestamp - b.timestamp);
    for (const raw of sorted) {
      const trade = hydrateTradeFees(raw);

      if (trade.side === "BUY") {
        if (quantity >= 0) {
          quantity += trade.quantity;
          costBasis += trade.quantity * trade.price;
        } else {
          const shortQty = -quantity;
          const avgEntry = costBasis / shortQty;
          if (trade.quantity < shortQty) {
            realizedPnL += trade.quantity * (avgEntry - trade.price);
            costBasis -= trade.quantity * avgEntry;
            quantity += trade.quantity;
          } else {
            realizedPnL += shortQty * (avgEntry - trade.price);
            const excess = trade.quantity - shortQty;
            quantity = excess;
            costBasis = excess > 0 ? excess * trade.price : 0;
          }
        }
      } else if (quantity <= 0) {
        quantity -= trade.quantity;
        costBasis += trade.quantity * trade.price;
      } else {
        const avgEntry = costBasis / quantity;
        if (trade.quantity < quantity) {
          realizedPnL += trade.quantity * (trade.price - avgEntry);
          costBasis -= trade.quantity * avgEntry;
          quantity -= trade.quantity;
        } else if (trade.quantity === quantity) {
          realizedPnL += trade.quantity * (trade.price - avgEntry);
          quantity = 0;
          costBasis = 0;
        } else {
          realizedPnL += quantity * (trade.price - avgEntry);
          const excess = trade.quantity - quantity;
          quantity = -excess;
          costBasis = excess * trade.price;
        }
      }
    }

    // Second arg is mutable walletCash (not immutable genesis deposit).
    const wallet = resolveWalletBalance(
      initialCashBalance,
      sorted.map(hydrateTradeFees),
      financialEvents,
    );
    if (wallet < -0.000_001) {
      throw new LedgerIntegrityError(
        `Ledger wallet invariant violated: balance ${wallet.toFixed(4)} < 0`,
      );
    }
  }
}
