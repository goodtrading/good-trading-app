import {
  SpotLedgerStorage,
  spotLedgerStorage,
} from "@/lib/portfolio/spot/SpotLedgerStorage";
import {
  kindsFromMutation,
  spotLedgerStore,
} from "@/lib/portfolio/spot/SpotLedgerStore";
import type {
  SpotBalance,
  SpotLedgerState,
  SpotOrder,
  SpotTrade,
} from "@/lib/portfolio/spot/types";

/**
 * SpotLedger — asset-ownership ledger (greenfield).
 *
 * Phase 4: create / load / save / persist balances & trades only.
 * No buy/sell/fill execution.
 *
 * Zero dependencies on PortfolioEngine, futuresAccounting, PositionEngine,
 * LiquidationEngine, or PERP OrderRegistry.
 */
export class SpotLedger {
  private state: SpotLedgerState | null = null;

  constructor(
    private readonly walletId: string,
    private readonly storage: SpotLedgerStorage = spotLedgerStorage,
  ) {}

  getWalletId(): string {
    return this.walletId;
  }

  /** In-memory snapshot; null if not loaded/created. */
  getState(): SpotLedgerState | null {
    return this.state ? cloneState(this.state) : null;
  }

  /**
   * Creates an empty ledger (optional initial USDT free balance) and persists it.
   * Fails if a ledger already exists for this wallet.
   */
  async createEmpty(initialUsdt: number = 0): Promise<SpotLedgerState> {
    const existing = await this.storage.loadState(this.walletId);
    if (existing) {
      throw new Error(
        `SpotLedger already exists for wallet ${this.walletId}`,
      );
    }

    this.state = await this.storage.createEmpty(this.walletId, initialUsdt);
    return cloneState(this.state);
  }

  /** Loads ledger from storage into memory. Returns null if none. */
  async load(): Promise<SpotLedgerState | null> {
    const loaded = await this.storage.loadState(this.walletId);
    this.state = loaded;
    return loaded ? cloneState(loaded) : null;
  }

  /**
   * Loads existing ledger or creates an empty one.
   * Does not overwrite an existing ledger.
   */
  async loadOrCreate(initialUsdt: number = 0): Promise<SpotLedgerState> {
    const loaded = await this.load();
    if (loaded) return loaded;
    return this.createEmpty(initialUsdt);
  }

  /** Persists the full in-memory state. */
  async save(): Promise<void> {
    if (!this.state) {
      throw new Error(`SpotLedger.save: no state loaded for ${this.walletId}`);
    }
    await this.storage.saveState(this.state);
    this.state = (await this.storage.loadState(this.walletId)) ?? this.state;
  }

  /** Replaces balances and persists only the balances key (+ meta). */
  async persistBalances(balances: SpotBalance[]): Promise<void> {
    const state = await this.requireState();
    state.balances = balances.map((b) => ({
      asset: b.asset,
      free: b.free,
      locked: b.locked,
      total: b.free + b.locked,
    }));
    state.updatedAt = Date.now();
    this.state = state;
    await this.storage.saveBalances(this.walletId, state.balances);
    await this.storage.saveMeta({
      walletId: this.walletId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });
    spotLedgerStore.publish(this.walletId, this.state, ["ledger"]);
  }

  /** Replaces trades and persists only the trades key (+ meta). */
  async persistTrades(trades: SpotTrade[]): Promise<void> {
    const state = await this.requireState();
    state.trades = trades.map((t) => ({ ...t, domain: "SPOT" as const }));
    state.updatedAt = Date.now();
    this.state = state;
    await this.storage.saveTrades(this.walletId, state.trades);
    await this.storage.saveMeta({
      walletId: this.walletId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    });
    spotLedgerStore.publish(this.walletId, this.state, ["trades"]);
  }

  /**
   * Atomically applies balances + trades and persists all spot keys.
   * Used by SpotExecutionService after MARKET fills.
   */
  async commitExecution(
    balances: SpotBalance[],
    trades: SpotTrade[],
  ): Promise<SpotLedgerState> {
    return this.commitMutation({ balances, trades });
  }

  /**
   * Atomically applies balances, orders, and optional trades.
   * Used by SpotOrderRegistry for LIMIT place / fill / cancel.
   */
  async commitMutation(args: {
    balances: SpotBalance[];
    orders?: SpotOrder[];
    trades?: SpotTrade[];
  }): Promise<SpotLedgerState> {
    const state = await this.requireState();
    state.balances = args.balances.map((b) => ({
      asset: b.asset,
      free: b.free,
      locked: b.locked,
      total: b.free + b.locked,
    }));
    if (args.orders) {
      state.orders = args.orders.map((o) => ({ ...o, domain: "SPOT" as const }));
    }
    if (args.trades) {
      state.trades = args.trades.map((t) => ({ ...t, domain: "SPOT" as const }));
    }
    state.updatedAt = Date.now();
    this.state = state;
    await this.storage.saveState(this.state);
    const snapshot = cloneState(this.state);
    const kinds = kindsFromMutation(args);
    if (kinds.length > 0) {
      spotLedgerStore.publish(this.walletId, snapshot, kinds);
    }
    return snapshot;
  }

  private async requireState(): Promise<SpotLedgerState> {
    if (this.state) return cloneState(this.state);
    const loaded = await this.load();
    if (!loaded) {
      throw new Error(
        `SpotLedger: no ledger for ${this.walletId}. Call createEmpty() or loadOrCreate() first.`,
      );
    }
    return loaded;
  }
}

function cloneState(state: SpotLedgerState): SpotLedgerState {
  return {
    walletId: state.walletId,
    balances: state.balances.map((b) => ({ ...b })),
    trades: state.trades.map((t) => ({ ...t })),
    orders: state.orders.map((o) => ({ ...o })),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}
