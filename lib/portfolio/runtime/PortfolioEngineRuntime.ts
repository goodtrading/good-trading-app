import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import {
  createPortfolioEngineBootstrap,
  type PortfolioEngineBootstrap,
} from "@/lib/portfolio/bootstrap/PortfolioEngineBootstrap";
import {
  captureEngineRuntimeMeta,
  hydratePortfolioEngine,
  loadEngineRuntimeMeta,
  saveEngineRuntimeMeta,
} from "@/lib/portfolio/bootstrap/PortfolioEngineHydrator";
import type { Order } from "@/lib/portfolio/orders/OrderEngine";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { MutableRiskPriceFeed } from "@/lib/portfolio/runtime/MutableRiskPriceFeed";
import { priceStream } from "@/lib/portfolio/runtime/PriceStream";
import {
  createPortfolioSnapshotService,
  ENGINE_VERSION,
  type PortfolioEngineSnapshot,
  type PortfolioSnapshotService,
} from "@/lib/portfolio/snapshot/PortfolioSnapshotService";
import type {
  PortfolioEngineState,
  Position,
  PositionMode,
} from "@/lib/portfolio/types";

export type RuntimeUiListener = () => void;

export type OrderBookLevel = {
  price: number;
  quantity: number;
  orderCount: number;
};

export type OrderBookState = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  openOrders: Order[];
};

export type RuntimeUiSnapshot = {
  accountId: string | null;
  marketPrice: number | null;
  leverage: number;
  positionMode: PositionMode;
  state: PortfolioEngineState | null;
  positions: Position[];
  openOrders: Order[];
  orderBook: OrderBookState;
};

function aggregateOrderBook(orders: Order[]): OrderBookState {
  const bidMap = new Map<number, OrderBookLevel>();
  const askMap = new Map<number, OrderBookLevel>();

  for (const order of orders) {
    if (order.status !== "OPEN" || order.price == null) continue;
    const bucket = order.side === "BUY" ? bidMap : askMap;
    const existing = bucket.get(order.price);
    if (existing) {
      existing.quantity += order.quantity;
      existing.orderCount += 1;
    } else {
      bucket.set(order.price, {
        price: order.price,
        quantity: order.quantity,
        orderCount: 1,
      });
    }
  }

  const bids = [...bidMap.values()].sort((a, b) => b.price - a.price);
  const asks = [...askMap.values()].sort((a, b) => a.price - b.price);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const midPrice =
    bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk;

  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    midPrice,
    openOrders: orders.map((order) => ({ ...order })),
  };
}

export type PortfolioEngineRuntimeStartConfig = {
  positionMode?: PositionMode;
  leverage?: number;
  riskIntervalMs?: number;
  marketPrice?: number | null;
};

type AccountRuntimeEntry = {
  accountId: string;
  bootstrap: PortfolioEngineBootstrap;
  priceFeed: MutableRiskPriceFeed;
  unsubscribeMutation?: () => void;
};

/**
 * Process-wide singleton controlling PortfolioEngineBootstrap lifecycle.
 * At most one RiskScheduler runs at a time (active account only).
 * Owns in-memory snapshots and rollback.
 */
class PortfolioEngineRuntimeImpl {
  private readonly entries = new Map<string, AccountRuntimeEntry>();
  private activeAccountId: string | null = null;
  private readonly snapshotService: PortfolioSnapshotService =
    createPortfolioSnapshotService();
  private readonly uiListeners = new Set<RuntimeUiListener>();

  getSnapshotService(): PortfolioSnapshotService {
    return this.snapshotService;
  }

  /** UI subscription — notified on price and engine mutations. */
  subscribe(listener: RuntimeUiListener): () => void {
    this.uiListeners.add(listener);
    return () => {
      this.uiListeners.delete(listener);
    };
  }

  private notifyUiListeners(): void {
    for (const listener of this.uiListeners) {
      try {
        listener();
      } catch (error) {
        console.warn("[RUNTIME UI LISTENER FAILED]", error);
      }
    }
  }

  /** UI-safe read model of the active engine. */
  async getSnapshot(): Promise<RuntimeUiSnapshot> {
    const accountId = this.activeAccountId;
    const engine = this.getActiveEngine();
    const entry = accountId ? this.entries.get(accountId) : undefined;
    const marketPrice =
      entry?.priceFeed.getLastPrice() ?? engine?.getLastMarketPrice() ?? null;

    if (!engine || marketPrice == null) {
      return {
        accountId,
        marketPrice,
        leverage: engine?.getLeverage() ?? 1,
        positionMode: engine?.getPositionMode() ?? "LONG_ONLY",
        state: null,
        positions: [],
        openOrders: [],
        orderBook: {
          bids: [],
          asks: [],
          bestBid: null,
          bestAsk: null,
          midPrice: null,
          openOrders: [],
        },
      };
    }

    const state = await engine.getState(marketPrice);
    const openOrders = engine.snapshotLimitOrders();
    return {
      accountId,
      marketPrice,
      leverage: engine.getLeverage(),
      positionMode: engine.getPositionMode(),
      state,
      positions: state.positions.filter((position) => position.quantity !== 0),
      openOrders,
      orderBook: aggregateOrderBook(openOrders),
    };
  }

  getOrderBookState(): OrderBookState {
    const engine = this.getActiveEngine();
    if (!engine) {
      return {
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        midPrice: null,
        openOrders: [],
      };
    }
    return aggregateOrderBook(engine.snapshotLimitOrders());
  }

  async getPositions(marketPrice?: number): Promise<Position[]> {
    const engine = this.getActiveEngine();
    if (!engine) return [];
    return engine.getPositions(marketPrice);
  }

  getEngineVersion(): string {
    return ENGINE_VERSION;
  }

  getRuntime(accountId: string): PortfolioEngineBootstrap | null {
    const entry = this.entries.get(accountId);
    if (!entry?.bootstrap.isStarted()) {
      return null;
    }
    return entry.bootstrap;
  }

  getActiveAccountId(): string | null {
    return this.activeAccountId;
  }

  getActiveEngine(): PortfolioEngine | null {
    if (!this.activeAccountId) return null;
    return this.getEngineIfStarted(this.activeAccountId);
  }

  getEngineIfStarted(accountId: string): PortfolioEngine | null {
    const bootstrap = this.getRuntime(accountId);
    if (!bootstrap) return null;
    try {
      return bootstrap.getEngine();
    } catch {
      return null;
    }
  }

  updatePrice(price: number | null): void {
    priceStream.publish(price);
    if (!this.activeAccountId) {
      this.notifyUiListeners();
      return;
    }
    const entry = this.entries.get(this.activeAccountId);
    entry?.priceFeed.setPrice(price);
    const engine = this.getEngineIfStarted(this.activeAccountId);
    if (engine && price != null && price > 0) {
      void engine
        .getState(price)
        .catch(() => undefined)
        .finally(() => this.notifyUiListeners());
      return;
    }
    this.notifyUiListeners();
  }

  async start(
    accountId: string,
    config: PortfolioEngineRuntimeStartConfig = {},
  ): Promise<PortfolioEngine> {
    if (!accountId) {
      throw new Error("PortfolioEngineRuntime.start requires accountId");
    }

    const existing = this.entries.get(accountId);
    if (existing?.bootstrap.isStarted() && this.activeAccountId === accountId) {
      if (config.marketPrice != null) {
        existing.priceFeed.setPrice(config.marketPrice);
      }
      console.log("[ENGINE RUNTIME START]", { accountId, reused: true });
      return existing.bootstrap.getEngine();
    }

    if (this.activeAccountId && this.activeAccountId !== accountId) {
      await this.stop(this.activeAccountId);
    }

    if (existing?.bootstrap.isStarted()) {
      await this.persistAndStopEntry(existing);
    }

    const priceFeed = new MutableRiskPriceFeed();
    if (config.marketPrice != null) {
      priceFeed.setPrice(config.marketPrice);
    }

    const storage = createPortfolioStorageForAccount(accountId);
    const bootstrap = createPortfolioEngineBootstrap();
    const storedMeta = await loadEngineRuntimeMeta(accountId);

    const positionMode = config.positionMode ?? storedMeta.positionMode;
    const leverage = config.leverage ?? storedMeta.leverage;

    const engine = bootstrap.start({
      storage,
      priceFeed,
      positionMode,
      leverage,
      walletId: accountId,
      riskIntervalMs: config.riskIntervalMs ?? 1000,
      autoStartRisk: true,
    });

    await hydratePortfolioEngine(
      engine,
      accountId,
      config.marketPrice ?? priceFeed.getLastPrice(),
      { applyStoredConfig: false },
    );

    const entry: AccountRuntimeEntry = {
      accountId,
      bootstrap,
      priceFeed,
    };
    this.entries.set(accountId, entry);
    this.activeAccountId = accountId;

    entry.unsubscribeMutation = engine.addMutationListener((reason, state) => {
      this.captureSnapshot(accountId, reason, state);
      this.notifyUiListeners();
    });

    console.log("[ENGINE RUNTIME START]", {
      accountId,
      reused: false,
      riskRunning: bootstrap.getRiskScheduler().isRunning(),
      engineVersion: ENGINE_VERSION,
    });

    this.notifyUiListeners();
    return engine;
  }

  async stop(accountId: string): Promise<void> {
    const entry = this.entries.get(accountId);
    if (!entry) {
      if (this.activeAccountId === accountId) {
        this.activeAccountId = null;
      }
      return;
    }

    await this.persistAndStopEntry(entry);
    this.entries.delete(accountId);

    if (this.activeAccountId === accountId) {
      this.activeAccountId = null;
    }

    console.log("[ENGINE RUNTIME STOP]", { accountId });
  }

  async stopActive(): Promise<void> {
    if (!this.activeAccountId) return;
    await this.stop(this.activeAccountId);
  }

  async switchAccount(
    newAccountId: string,
    config: PortfolioEngineRuntimeStartConfig = {},
  ): Promise<PortfolioEngine> {
    console.log("[ENGINE RUNTIME SWITCH ACCOUNT]", {
      from: this.activeAccountId,
      to: newAccountId,
    });

    if (this.activeAccountId === newAccountId) {
      return this.start(newAccountId, config);
    }

    if (this.activeAccountId) {
      const activeEngine = this.getEngineIfStarted(this.activeAccountId);
      if (activeEngine) {
        const price =
          config.marketPrice ??
          this.entries.get(this.activeAccountId)?.priceFeed.getLastPrice() ??
          activeEngine.getLastMarketPrice() ??
          0;
        if (price > 0) {
          const state = await activeEngine.getState(price);
          this.captureSnapshot(this.activeAccountId, "switch_account", state);
        }
      }
      await this.stop(this.activeAccountId);
    }

    return this.start(newAccountId, config);
  }

  /**
   * Restores engine + runtime config from an in-memory snapshot.
   * Stops RiskScheduler, restores ledger via restoreState, restarts scheduler if it was running.
   */
  async rollback(snapshotId: string): Promise<PortfolioEngine> {
    const snapshot = this.snapshotService.getById(snapshotId);
    if (!snapshot) {
      throw new Error(`PortfolioEngineRuntime.rollback: snapshot not found: ${snapshotId}`);
    }

    const accountId = snapshot.accountId;
    const existing = this.entries.get(accountId);
    const priceFeed = existing?.priceFeed ?? new MutableRiskPriceFeed();
    const marketPrice =
      priceFeed.getLastPrice() ??
      snapshot.positions[0]?.marketPrice ??
      snapshot.trades[snapshot.trades.length - 1]?.price ??
      null;

    if (marketPrice != null) {
      priceFeed.setPrice(marketPrice);
    }

    const riskWasRunning =
      existing?.bootstrap.isStarted() === true &&
      existing.bootstrap.getRiskScheduler().isRunning();

    // Stop without persisting the pre-rollback (possibly bad) state as meta.
    if (existing?.bootstrap.isStarted()) {
      existing.unsubscribeMutation?.();
      existing.bootstrap.stop();
    }
    this.entries.delete(accountId);
    if (this.activeAccountId === accountId) {
      this.activeAccountId = null;
    }

    const storage = createPortfolioStorageForAccount(accountId);
    const bootstrap = createPortfolioEngineBootstrap();

    const engine = bootstrap.start({
      storage,
      priceFeed,
      positionMode: snapshot.positionMode,
      leverage: snapshot.leverage,
      autoStartRisk: false,
    });

    await engine.restoreState({
      initialCashBalance: snapshot.engineState.initialCashBalance,
      walletCash: snapshot.engineState.walletCash,
      trades: snapshot.trades,
      openLimitOrders: snapshot.openOrders,
      leverage: snapshot.leverage,
      positionMode: snapshot.positionMode,
      marketPrice: marketPrice ?? undefined,
    });

    await saveEngineRuntimeMeta(accountId, {
      leverage: snapshot.leverage,
      positionMode: snapshot.positionMode,
      openLimitOrders: snapshot.openOrders,
    });

    const entry: AccountRuntimeEntry = {
      accountId,
      bootstrap,
      priceFeed,
    };
    this.entries.set(accountId, entry);
    this.activeAccountId = accountId;

    entry.unsubscribeMutation = engine.addMutationListener((reason, state) => {
      this.captureSnapshot(accountId, reason, state);
      this.notifyUiListeners();
    });

    if (riskWasRunning) {
      bootstrap.getRiskScheduler().start();
    }

    this.notifyUiListeners();

    console.log("[ENGINE RUNTIME ROLLBACK]", {
      snapshotId,
      accountId,
      riskRunning: bootstrap.getRiskScheduler().isRunning(),
      tradeCount: snapshot.trades.length,
    });

    return engine;
  }

  /** Test helper: count running risk schedulers (must be 0 or 1). */
  countRunningSchedulers(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.bootstrap.isStarted() && entry.bootstrap.getRiskScheduler().isRunning()) {
        count += 1;
      }
    }
    return count;
  }

  /** Test helper: reset singleton state. */
  async resetForTests(): Promise<void> {
    const ids = [...this.entries.keys()];
    for (const accountId of ids) {
      await this.stop(accountId);
    }
    this.entries.clear();
    this.activeAccountId = null;
    this.snapshotService.clear();
    this.uiListeners.clear();
    priceStream.resetForTests();
  }

  private captureSnapshot(
    accountId: string,
    reason: string,
    state: import("@/lib/portfolio/types").PortfolioEngineState,
  ): PortfolioEngineSnapshot | null {
    const entry = this.entries.get(accountId);
    const engine = this.getEngineIfStarted(accountId);
    if (!entry || !engine) {
      return null;
    }

    return this.snapshotService.createSnapshot({
      accountId,
      reason,
      engineState: state,
      openOrders: engine.snapshotLimitOrders(),
      leverage: engine.getLeverage(),
      positionMode: engine.getPositionMode(),
      riskScheduler: {
        running: entry.bootstrap.getRiskScheduler().isRunning(),
      },
      engineVersion: ENGINE_VERSION,
    });
  }

  private async persistAndStopEntry(entry: AccountRuntimeEntry): Promise<void> {
    if (entry.bootstrap.isStarted()) {
      try {
        const engine = entry.bootstrap.getEngine();
        await captureEngineRuntimeMeta(entry.accountId, engine);
      } catch (error) {
        console.warn("[ENGINE RUNTIME PERSIST FAILED]", {
          accountId: entry.accountId,
          error,
        });
      }
      entry.unsubscribeMutation?.();
      entry.bootstrap.stop();
    }
  }
}

export const portfolioEngineRuntime = new PortfolioEngineRuntimeImpl();

/** @deprecated Prefer portfolioEngineRuntime singleton. */
export function getPortfolioEngineRuntime(): PortfolioEngineRuntimeImpl {
  return portfolioEngineRuntime;
}
