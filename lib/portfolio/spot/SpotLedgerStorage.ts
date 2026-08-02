import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  spotBalancesStorageKey,
  spotLedgerMetaStorageKey,
  spotOrdersStorageKey,
  spotTradesStorageKey,
} from "@/lib/portfolio/spot/storageKeys";
import {
  createEmptySpotLedgerState,
  createSpotBalance,
  type SpotBalance,
  type SpotLedgerState,
  type SpotOrder,
  type SpotTrade,
} from "@/lib/portfolio/spot/types";

type SpotLedgerMeta = {
  walletId: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Persistence adapter for SpotLedger.
 * Uses only AsyncStorage — no PERP / PortfolioEngine dependencies.
 */
export class SpotLedgerStorage {
  async loadBalances(walletId: string): Promise<SpotBalance[]> {
    const raw = await AsyncStorage.getItem(spotBalancesStorageKey(walletId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSpotBalanceShape).map(normalizeBalance);
    } catch {
      return [];
    }
  }

  async saveBalances(walletId: string, balances: SpotBalance[]): Promise<void> {
    const normalized = balances.map(normalizeBalance);
    await AsyncStorage.setItem(
      spotBalancesStorageKey(walletId),
      JSON.stringify(normalized),
    );
  }

  async loadTrades(walletId: string): Promise<SpotTrade[]> {
    const raw = await AsyncStorage.getItem(spotTradesStorageKey(walletId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSpotTradeShape);
    } catch {
      return [];
    }
  }

  async saveTrades(walletId: string, trades: SpotTrade[]): Promise<void> {
    await AsyncStorage.setItem(spotTradesStorageKey(walletId), JSON.stringify(trades));
  }

  async loadOrders(walletId: string): Promise<SpotOrder[]> {
    const raw = await AsyncStorage.getItem(spotOrdersStorageKey(walletId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSpotOrderShape);
    } catch {
      return [];
    }
  }

  async saveOrders(walletId: string, orders: SpotOrder[]): Promise<void> {
    await AsyncStorage.setItem(spotOrdersStorageKey(walletId), JSON.stringify(orders));
  }

  async loadMeta(walletId: string): Promise<SpotLedgerMeta | null> {
    const raw = await AsyncStorage.getItem(spotLedgerMetaStorageKey(walletId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SpotLedgerMeta;
      if (parsed.walletId !== walletId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async saveMeta(meta: SpotLedgerMeta): Promise<void> {
    await AsyncStorage.setItem(
      spotLedgerMetaStorageKey(meta.walletId),
      JSON.stringify(meta),
    );
  }

  /** Loads full ledger state from independent keys. */
  async loadState(walletId: string): Promise<SpotLedgerState | null> {
    const meta = await this.loadMeta(walletId);
    if (!meta) return null;

    const [balances, trades, orders] = await Promise.all([
      this.loadBalances(walletId),
      this.loadTrades(walletId),
      this.loadOrders(walletId),
    ]);

    return {
      walletId,
      balances,
      trades,
      orders,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  /** Persists full ledger state to independent keys. */
  async saveState(state: SpotLedgerState): Promise<void> {
    const updatedAt = Date.now();
    const next: SpotLedgerState = { ...state, updatedAt };

    await Promise.all([
      this.saveBalances(next.walletId, next.balances),
      this.saveTrades(next.walletId, next.trades),
      this.saveOrders(next.walletId, next.orders),
      this.saveMeta({
        walletId: next.walletId,
        createdAt: next.createdAt,
        updatedAt,
      }),
    ]);
  }

  async createEmpty(
    walletId: string,
    initialUsdt: number = 0,
  ): Promise<SpotLedgerState> {
    const state = createEmptySpotLedgerState(walletId, initialUsdt);
    await this.saveState(state);
    return state;
  }
}

function normalizeBalance(balance: SpotBalance): SpotBalance {
  return createSpotBalance(balance.asset, balance.free, balance.locked);
}

function isSpotBalanceShape(value: unknown): value is SpotBalance {
  if (!value || typeof value !== "object") return false;
  const b = value as Partial<SpotBalance>;
  return (
    typeof b.asset === "string" &&
    typeof b.free === "number" &&
    typeof b.locked === "number"
  );
}

function isSpotTradeShape(value: unknown): value is SpotTrade {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<SpotTrade>;
  return (
    t.domain === "SPOT" &&
    typeof t.id === "string" &&
    typeof t.walletId === "string" &&
    typeof t.baseAsset === "string" &&
    typeof t.quoteAsset === "string" &&
    (t.side === "BUY" || t.side === "SELL") &&
    typeof t.quantity === "number" &&
    typeof t.price === "number" &&
    typeof t.timestamp === "number"
  );
}

function isSpotOrderShape(value: unknown): value is SpotOrder {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<SpotOrder>;
  return (
    o.domain === "SPOT" &&
    typeof o.id === "string" &&
    typeof o.walletId === "string" &&
    typeof o.status === "string"
  );
}

export const spotLedgerStorage = new SpotLedgerStorage();
