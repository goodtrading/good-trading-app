import type { SpotBalance, SpotLedgerState, SpotOrder, SpotTrade } from "@/lib/portfolio/spot/types";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";

export type SpotLedgerUpdateKind = "ledger" | "orders" | "trades" | "positions";

type Listener = () => void;

type WalletSlice = {
  balances: SpotBalance[];
  trades: SpotTrade[];
  orders: SpotOrder[];
  ledgerVersion: number;
  ordersVersion: number;
  tradesVersion: number;
  positionsVersion: number;
};

const EMPTY_BALANCES: SpotBalance[] = [];
const EMPTY_TRADES: SpotTrade[] = [];
const EMPTY_ORDERS: SpotOrder[] = [];
const EMPTY_POSITIONS: SpotPositionLive[] = [];

type Versioned<T> = { version: number; data: T };

const EMPTY_BALANCES_SNAPSHOT: Versioned<SpotBalance[]> = {
  version: 0,
  data: EMPTY_BALANCES,
};
const EMPTY_TRADES_SNAPSHOT: Versioned<SpotTrade[]> = {
  version: 0,
  data: EMPTY_TRADES,
};
const EMPTY_ORDERS_SNAPSHOT: Versioned<SpotOrder[]> = {
  version: 0,
  data: EMPTY_ORDERS,
};
const EMPTY_POSITIONS_SNAPSHOT: Versioned<SpotPositionLive[]> = {
  version: 0,
  data: EMPTY_POSITIONS,
};

function filterOpenOrders(orders: SpotOrder[]): SpotOrder[] {
  return orders.filter(
    (order) => order.status === "PENDING" || order.status === "PARTIALLY_FILLED",
  );
}

/**
 * External store for SpotLedger projections — UI subscribes per slice
 * without parent re-renders or full workspace reloads.
 */
class SpotLedgerStoreImpl {
  private slices = new Map<string, WalletSlice>();
  private balanceCache = new Map<string, Versioned<SpotBalance[]>>();
  private tradesCache = new Map<string, Versioned<SpotTrade[]>>();
  private ordersCache = new Map<string, Versioned<SpotOrder[]>>();
  private openOrdersCache = new Map<string, Versioned<SpotOrder[]>>();
  private positionsCache = new Map<string, Versioned<SpotPositionLive[]>>();
  private listeners = new Set<Listener>();
  private positionListeners = new Set<Listener>();

  publish(
    walletId: string,
    state: SpotLedgerState,
    kinds: SpotLedgerUpdateKind[],
  ): void {
    const prev = this.slices.get(walletId);
    const next: WalletSlice = {
      balances: state.balances.map((b) => ({ ...b })),
      trades: state.trades.map((t) => ({ ...t })),
      orders: state.orders.map((o) => ({ ...o })),
      ledgerVersion: prev?.ledgerVersion ?? 0,
      ordersVersion: prev?.ordersVersion ?? 0,
      tradesVersion: prev?.tradesVersion ?? 0,
      positionsVersion: prev?.positionsVersion ?? 0,
    };

    if (kinds.includes("ledger")) {
      next.ledgerVersion += 1;
    }
    if (kinds.includes("orders")) {
      next.ordersVersion += 1;
    }
    if (kinds.includes("trades")) {
      next.tradesVersion += 1;
    }

    this.slices.set(walletId, next);
    this.balanceCache.set(walletId, {
      version: next.ledgerVersion,
      data: next.balances,
    });
    this.tradesCache.set(walletId, {
      version: next.tradesVersion,
      data: next.trades,
    });
    this.ordersCache.set(walletId, {
      version: next.ordersVersion,
      data: next.orders,
    });
    if (kinds.includes("orders")) {
      this.openOrdersCache.set(walletId, {
        version: next.ordersVersion,
        data: filterOpenOrders(next.orders),
      });
    }
    this.emit();
  }

  /** Full sync — increments ledger slice versions (initial load). */
  sync(walletId: string, state: SpotLedgerState): void {
    this.publish(walletId, state, ["ledger", "orders", "trades"]);
  }

  publishPositions(walletId: string, positions: SpotPositionLive[]): void {
    const prev = this.slices.get(walletId);
    const nextSlice: WalletSlice = {
      balances: prev?.balances ?? [],
      trades: prev?.trades ?? [],
      orders: prev?.orders ?? [],
      ledgerVersion: prev?.ledgerVersion ?? 0,
      ordersVersion: prev?.ordersVersion ?? 0,
      tradesVersion: prev?.tradesVersion ?? 0,
      positionsVersion: (prev?.positionsVersion ?? 0) + 1,
    };
    this.slices.set(walletId, nextSlice);
    this.positionsCache.set(walletId, {
      version: nextSlice.positionsVersion,
      data: positions.map((p) => ({ ...p })),
    });
    this.emitPositions();
  }

  getOpenPositionsSnapshot(walletId: string): SpotPositionLive[] {
    return this.positionsCache.get(walletId)?.data ?? EMPTY_POSITIONS;
  }

  getPositionsVersioned(walletId: string): Versioned<SpotPositionLive[]> {
    return this.positionsCache.get(walletId) ?? EMPTY_POSITIONS_SNAPSHOT;
  }


  getBalancesSnapshot(walletId: string): SpotBalance[] {
    return this.balanceCache.get(walletId)?.data ?? EMPTY_BALANCES;
  }

  getTradesSnapshot(walletId: string): SpotTrade[] {
    return this.tradesCache.get(walletId)?.data ?? EMPTY_TRADES;
  }

  getOrdersSnapshot(walletId: string): SpotOrder[] {
    return this.ordersCache.get(walletId)?.data ?? EMPTY_ORDERS;
  }

  getOpenOrders(walletId: string): SpotOrder[] {
    return this.openOrdersCache.get(walletId)?.data ?? EMPTY_ORDERS;
  }

  getOpenOrdersVersioned(walletId: string): Versioned<SpotOrder[]> {
    return this.openOrdersCache.get(walletId) ?? EMPTY_ORDERS_SNAPSHOT;
  }

  getBalancesVersioned(walletId: string): Versioned<SpotBalance[]> {
    return this.balanceCache.get(walletId) ?? EMPTY_BALANCES_SNAPSHOT;
  }

  getTradesVersioned(walletId: string): Versioned<SpotTrade[]> {
    return this.tradesCache.get(walletId) ?? EMPTY_TRADES_SNAPSHOT;
  }

  getOrdersVersioned(walletId: string): Versioned<SpotOrder[]> {
    return this.ordersCache.get(walletId) ?? EMPTY_ORDERS_SNAPSHOT;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribePositions(listener: Listener): () => void {
    this.positionListeners.add(listener);
    return () => {
      this.positionListeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private emitPositions(): void {
    for (const listener of this.positionListeners) {
      listener();
    }
  }
}

export const spotLedgerStore = new SpotLedgerStoreImpl();

export function kindsFromMutation(args: {
  balances?: SpotBalance[];
  orders?: SpotOrder[];
  trades?: SpotTrade[];
}): SpotLedgerUpdateKind[] {
  const kinds: SpotLedgerUpdateKind[] = [];
  if (args.balances) kinds.push("ledger");
  if (args.orders) kinds.push("orders");
  if (args.trades) kinds.push("trades");
  return kinds;
}
