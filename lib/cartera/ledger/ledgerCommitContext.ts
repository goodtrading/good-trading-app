/**
 * Runtime gate: storage.save() is permitted only while a ledger commit is active.
 * LedgerTransaction.commit() and commitGenesisLedger() enter this context.
 */
let commitDepth = 0;

export function isLedgerCommitActive(): boolean {
  return commitDepth > 0;
}

export async function runWithinLedgerCommit<T>(fn: () => Promise<T>): Promise<T> {
  commitDepth += 1;
  try {
    return await fn();
  } finally {
    commitDepth -= 1;
  }
}

/** @internal Test-only reset of commit gate state. */
export function resetLedgerCommitContextForTests(): void {
  commitDepth = 0;
}
