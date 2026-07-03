import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import {
  createPortfolioAccountRecord,
  deletePortfolioAccount,
  loadAccountsRegistry,
  setActivePortfolioAccount,
  getActiveAccount,
} from "@/lib/portfolio/accounts/accountStorage";
import { initializeAccountTradeLedger } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";

export async function bootstrapPortfolioAccount(
  name: string,
  initialBalance: number,
): Promise<PortfolioAccount> {
  const account = await createPortfolioAccountRecord(name, initialBalance);
  await initializeAccountTradeLedger(account.id, initialBalance);
  return account;
}

export async function listPortfolioAccounts(): Promise<PortfolioAccount[]> {
  const registry = await loadAccountsRegistry();
  return registry.accounts;
}

export async function resolveActivePortfolioAccount(): Promise<PortfolioAccount | null> {
  const registry = await loadAccountsRegistry();
  return getActiveAccount(registry);
}

export function createEngineForAccountStorage(storage: PortfolioStorage) {
  return createPortfolioEngine(storage, new PaperBroker());
}

export { setActivePortfolioAccount, loadAccountsRegistry, getActiveAccount, deletePortfolioAccount };
