import {
  assertLedgerIntegrity,
  LedgerIntegrityError,
  LedgerValidationError,
  validateLedgerEntry,
} from "@/lib/cartera/ledger/LedgerEntrySchema";
import { runWithinLedgerCommit } from "@/lib/cartera/ledger/ledgerCommitContext";
import {
  AsyncPortfolioStorage,
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioPersistedState, Trade } from "@/lib/portfolio/types";

export class LedgerTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerTransactionError";
  }
}

export class LedgerMutationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerMutationForbiddenError";
  }
}

/**
 * Atomic ledger write boundary.
 *
 * begin → append (validated) → assert invariants → commit (single save)
 * Any failure → rollback (no partial persistence)
 */
export class LedgerTransaction {
  private readonly pendingTrades: Trade[] = [];
  private finished = false;

  private constructor(
    private readonly storage: PortfolioStorage,
    private readonly baseState: PortfolioPersistedState,
  ) {}

  static async begin(storage: PortfolioStorage): Promise<LedgerTransaction> {
    const baseState = await storage.load();
    assertLedgerIntegrity(baseState.trades, baseState.initialCashBalance);
    return new LedgerTransaction(storage, baseState);
  }

  get base(): Readonly<PortfolioPersistedState> {
    this.assertOpen();
    return this.baseState;
  }

  get pending(): readonly Trade[] {
    this.assertOpen();
    return this.pendingTrades;
  }

  workingTrades(): Trade[] {
    this.assertOpen();
    return [...this.baseState.trades, ...this.pendingTrades];
  }

  appendTrade(trade: Trade): void {
    this.assertOpen();
    validateLedgerEntry(trade);
    this.pendingTrades.push(trade);
  }

  async commit(): Promise<PortfolioPersistedState> {
    this.assertOpen();

    const nextState: PortfolioPersistedState = {
      ...this.baseState,
      trades: [...this.baseState.trades, ...this.pendingTrades],
    };

    assertLedgerIntegrity(nextState.trades, nextState.initialCashBalance);
    await runWithinLedgerCommit(async () => {
      await this.storage.save(nextState);
    });

    this.finished = true;
    return nextState;
  }

  rollback(): void {
    if (this.finished) return;
    this.pendingTrades.length = 0;
    this.finished = true;
  }

  private assertOpen(): void {
    if (this.finished) {
      throw new LedgerTransactionError("Ledger transaction is already closed");
    }
  }
}

export async function beginLedgerTransaction(storage: PortfolioStorage): Promise<LedgerTransaction> {
  return LedgerTransaction.begin(storage);
}

/**
 * One-time wallet genesis — commits initial empty ledger with opening cash metadata.
 * Allowed only when no persisted ledger exists for this storage key.
 * Not a reset: never clears existing financial history.
 */
export async function commitGenesisLedger(
  storage: PortfolioStorage,
  initialCashBalance: number,
): Promise<PortfolioPersistedState> {
  if (storage instanceof AsyncPortfolioStorage) {
    if (await storage.hasPersisted()) {
      throw new LedgerMutationForbiddenError(
        "commitGenesisLedger is forbidden: ledger already exists for this wallet",
      );
    }
  } else if (storage instanceof MemoryPortfolioStorage) {
    if (storage.hasPersistedLedger()) {
      throw new LedgerMutationForbiddenError(
        "commitGenesisLedger is forbidden: ledger already exists for this wallet",
      );
    }
  } else {
    const existing = await storage.load();
    if (existing.trades.length > 0 || existing.orders.length > 0 || existing.fills.length > 0) {
      throw new LedgerMutationForbiddenError(
        "commitGenesisLedger is forbidden: ledger already contains entries",
      );
    }
  }

  const genesisState = createEmptyPersistedState(initialCashBalance);
  assertLedgerIntegrity(genesisState.trades, genesisState.initialCashBalance);

  await runWithinLedgerCommit(async () => {
    await storage.save(genesisState);
  });

  return genesisState;
}

export function rejectLedgerReset(): never {
  return rejectLedgerMutation("reset");
}

export function assertPersistedLedgerIntegrity(state: PortfolioPersistedState): void {
  assertLedgerIntegrity(state.trades, state.initialCashBalance);
}

export function rejectLedgerMutation(operation: string): never {
  throw new LedgerMutationForbiddenError(
    `${operation} is forbidden: ledger entries are append-only. Use compensating TradeExecution via LedgerTransaction.`,
  );
}

export { LedgerIntegrityError, LedgerValidationError };
