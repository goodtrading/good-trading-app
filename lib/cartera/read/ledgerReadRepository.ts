import AsyncStorage from "@react-native-async-storage/async-storage";

import { assertPersistedLedgerIntegrity } from "@/lib/cartera/ledger/LedgerTransaction";
import { portfolioTradesStorageKey } from "@/lib/portfolio/accounts/accountStorage";
import { DEFAULT_INITIAL_CASH_BALANCE } from "@/lib/portfolio/constants";
import { createEmptyPersistedState } from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioPersistedState } from "@/lib/portfolio/types";

/**
 * Read-only ledger access for Portfolio bounded context.
 * Never calls PortfolioEngine, brokers, or storage.save().
 */
export async function readAccountLedger(accountId: string): Promise<PortfolioPersistedState> {
  const raw = await AsyncStorage.getItem(portfolioTradesStorageKey(accountId));
  if (!raw) {
    return createEmptyPersistedState();
  }

  const parsed = JSON.parse(raw) as PortfolioPersistedState;
  const state = {
    initialCashBalance: parsed.initialCashBalance ?? DEFAULT_INITIAL_CASH_BALANCE,
    trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    fills: Array.isArray(parsed.fills) ? parsed.fills : [],
  };

  assertPersistedLedgerIntegrity(state);
  return state;
}
