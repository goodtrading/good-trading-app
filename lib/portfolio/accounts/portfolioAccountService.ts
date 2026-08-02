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
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";

/**
 * Creates PaperAccount with two wallets:
 * - SpotWallet = initialBalance (USDT free)
 * - PerpWallet = 0
 */
export async function bootstrapPortfolioAccount(
  name: string,
  initialBalance: number,
): Promise<PortfolioAccount> {
  const account = await createPortfolioAccountRecord(name, initialBalance);
  // PerpWallet lifecycle — PERP ledger genesis at 0.
  await initializeAccountTradeLedger(account.id, 0);
  // SpotWallet lifecycle — SpotLedger funded with account capital.
  await spotLedgerRuntime.start(account.id, {
    createIfMissing: true,
    initialUsdt: initialBalance,
  });
  await spotPositionRuntime.start(account.id);
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
