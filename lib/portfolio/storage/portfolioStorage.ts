import AsyncStorage from "@react-native-async-storage/async-storage";

import { assertLedgerSavePermitted } from "@/lib/cartera/ledger/ledgerStorageGuard";
import { rejectLedgerMutation } from "@/lib/cartera/ledger/LedgerTransaction";
import { DEFAULT_INITIAL_CASH_BALANCE, PORTFOLIO_STORAGE_KEY } from "@/lib/portfolio/constants";
import type { PortfolioPersistedState } from "@/lib/portfolio/types";

export interface PortfolioStorage {
  load(): Promise<PortfolioPersistedState>;
  save(state: PortfolioPersistedState): Promise<void>;
  clear(): Promise<void>;
}

export function createEmptyPersistedState(
  initialCashBalance: number = DEFAULT_INITIAL_CASH_BALANCE,
): PortfolioPersistedState {
  return {
    initialCashBalance,
    /** Mutable cash starts equal to genesis deposit. */
    walletCash: initialCashBalance,
    trades: [],
    financialEvents: [],
    orders: [],
    fills: [],
  };
}

function normalizePersistedState(
  state: PortfolioPersistedState,
): PortfolioPersistedState {
  const initialCashBalance =
    state.initialCashBalance ?? DEFAULT_INITIAL_CASH_BALANCE;
  return {
    initialCashBalance,
    walletCash: state.walletCash ?? initialCashBalance,
    trades: Array.isArray(state.trades) ? [...state.trades] : [],
    financialEvents: Array.isArray(state.financialEvents) ? [...state.financialEvents] : [],
    orders: Array.isArray(state.orders) ? [...state.orders] : [],
    fills: Array.isArray(state.fills) ? [...state.fills] : [],
    ...(Array.isArray(state.ocoGroups) ? { ocoGroups: [...state.ocoGroups] } : {}),
    ...(Array.isArray(state.trailingStops) ? { trailingStops: [...state.trailingStops] } : {}),
    ...(state.insuranceFund ? { insuranceFund: { ...state.insuranceFund } } : {}),
  };
}

function clonePersistedState(state: PortfolioPersistedState): PortfolioPersistedState {
  return normalizePersistedState(state);
}

export class MemoryPortfolioStorage implements PortfolioStorage {
  private state: PortfolioPersistedState;
  private ledgerCommitted = false;

  constructor(initialState: PortfolioPersistedState = createEmptyPersistedState()) {
    this.state = clonePersistedState(initialState);
  }

  hasPersistedLedger(): boolean {
    return this.ledgerCommitted;
  }

  async load(): Promise<PortfolioPersistedState> {
    return clonePersistedState(this.state);
  }

  async save(state: PortfolioPersistedState): Promise<void> {
    assertLedgerSavePermitted();
    this.state = clonePersistedState(state);
    this.ledgerCommitted = true;
  }

  async clear(): Promise<void> {
    rejectLedgerMutation("storage.clear");
  }
}

export class AsyncPortfolioStorage implements PortfolioStorage {
  constructor(private readonly storageKey: string = PORTFOLIO_STORAGE_KEY) {}

  async hasPersisted(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(this.storageKey);
    return raw != null;
  }

  async load(): Promise<PortfolioPersistedState> {
    const raw = await AsyncStorage.getItem(this.storageKey);
    if (!raw) {
      return createEmptyPersistedState();
    }

    const parsed = JSON.parse(raw) as PortfolioPersistedState;
    return normalizePersistedState(parsed);
  }

  async save(state: PortfolioPersistedState): Promise<void> {
    assertLedgerSavePermitted();
    await AsyncStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    rejectLedgerMutation("storage.clear");
  }
}

let defaultStorage: PortfolioStorage | null = null;

export function getDefaultPortfolioStorage(): PortfolioStorage {
  if (!defaultStorage) {
    defaultStorage = new AsyncPortfolioStorage();
  }
  return defaultStorage;
}

/** Test-only reset for singleton storage handle. */
export function resetDefaultPortfolioStorageForTests(): void {
  defaultStorage = null;
}
