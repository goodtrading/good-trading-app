import { commitGenesisLedger } from "@/lib/cartera/ledger/LedgerTransaction";
import { portfolioTradesStorageKey } from "@/lib/portfolio/accounts/accountStorage";
import {
  AsyncPortfolioStorage,
  type PortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";

export function createPortfolioStorageForAccount(accountId: string): PortfolioStorage {
  return new AsyncPortfolioStorage(portfolioTradesStorageKey(accountId));
}

export async function initializeAccountTradeLedger(
  accountId: string,
  initialBalance: number,
): Promise<void> {
  const storage = createPortfolioStorageForAccount(accountId);
  await commitGenesisLedger(storage, initialBalance);
}
