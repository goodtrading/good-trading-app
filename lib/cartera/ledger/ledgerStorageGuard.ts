import { LedgerMutationForbiddenError } from "@/lib/cartera/ledger/LedgerTransaction";
import { isLedgerCommitActive } from "@/lib/cartera/ledger/ledgerCommitContext";

export function assertLedgerSavePermitted(operation = "storage.save"): void {
  if (!isLedgerCommitActive()) {
    throw new LedgerMutationForbiddenError(
      `${operation} is forbidden outside LedgerTransaction.commit() or commitGenesisLedger()`,
    );
  }
}
