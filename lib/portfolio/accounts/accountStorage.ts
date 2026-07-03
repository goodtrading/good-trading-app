import AsyncStorage from "@react-native-async-storage/async-storage";

import { MAX_PAPER_ACCOUNTS } from "@/lib/portfolio/accounts/constants";
import type { PortfolioAccountsRegistry, PortfolioAccount } from "@/lib/portfolio/accounts/types";

export const PORTFOLIO_ACCOUNTS_STORAGE_KEY = "@goodtrading/portfolio/accounts/registry/v1";

export function portfolioTradesStorageKey(accountId: string): string {
  return `@goodtrading/portfolio/accounts/${accountId}/trades/v1`;
}

function createAccountId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

const emptyRegistry = (): PortfolioAccountsRegistry => ({
  accounts: [],
  activeAccountId: null,
});

export async function loadAccountsRegistry(): Promise<PortfolioAccountsRegistry> {
  const raw = await AsyncStorage.getItem(PORTFOLIO_ACCOUNTS_STORAGE_KEY);
  if (!raw) return emptyRegistry();

  const parsed = JSON.parse(raw) as PortfolioAccountsRegistry;
  return {
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    activeAccountId: parsed.activeAccountId ?? null,
  };
}

export async function saveAccountsRegistry(registry: PortfolioAccountsRegistry): Promise<void> {
  await AsyncStorage.setItem(PORTFOLIO_ACCOUNTS_STORAGE_KEY, JSON.stringify(registry));
}

export async function createPortfolioAccountRecord(
  name: string,
  initialBalance: number,
): Promise<PortfolioAccount> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("El nombre de la cartera es obligatorio");
  }
  if (!Number.isFinite(initialBalance) || initialBalance <= 0) {
    throw new Error("El capital inicial debe ser mayor a cero");
  }

  const registry = await loadAccountsRegistry();
  if (registry.accounts.length >= MAX_PAPER_ACCOUNTS) {
    throw new Error(`Máximo ${MAX_PAPER_ACCOUNTS} carteras Paper`);
  }

  const account: PortfolioAccount = {
    id: createAccountId(),
    name: trimmedName,
    initialBalance,
    createdAt: Date.now(),
  };

  const nextRegistry: PortfolioAccountsRegistry = {
    accounts: [...registry.accounts, account],
    activeAccountId: account.id,
  };

  await saveAccountsRegistry(nextRegistry);
  return account;
}

export async function setActivePortfolioAccount(accountId: string): Promise<void> {
  const registry = await loadAccountsRegistry();
  if (!registry.accounts.some((account) => account.id === accountId)) {
    throw new Error("Cuenta no encontrada");
  }
  await saveAccountsRegistry({ ...registry, activeAccountId: accountId });
}

export async function deletePortfolioAccount(accountId: string): Promise<PortfolioAccountsRegistry> {
  const registry = await loadAccountsRegistry();
  if (!registry.accounts.some((account) => account.id === accountId)) {
    throw new Error("Cuenta no encontrada");
  }
  if (registry.accounts.length <= 1) {
    throw new Error("Debe existir al menos una cuenta Paper.");
  }

  const nextAccounts = registry.accounts.filter((account) => account.id !== accountId);
  const nextActiveId =
    registry.activeAccountId === accountId
      ? (nextAccounts[0]?.id ?? null)
      : registry.activeAccountId;

  const nextRegistry: PortfolioAccountsRegistry = {
    accounts: nextAccounts,
    activeAccountId: nextActiveId,
  };

  await saveAccountsRegistry(nextRegistry);
  await AsyncStorage.removeItem(portfolioTradesStorageKey(accountId));
  return nextRegistry;
}

export function getActiveAccount(
  registry: PortfolioAccountsRegistry,
): PortfolioAccount | null {
  if (!registry.activeAccountId) return null;
  return registry.accounts.find((account) => account.id === registry.activeAccountId) ?? null;
}
