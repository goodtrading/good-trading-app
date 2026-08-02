import { marketTickStore } from "@/lib/market/MarketTickStore";
import {
  spotPositionEngine,
  SpotPositionEngine,
} from "@/lib/portfolio/spot/SpotPositionEngine";
import {
  spotPositionStorage,
  SpotPositionStorage,
} from "@/lib/portfolio/spot/SpotPositionStorage";
import {
  withLiveMarks,
  type SpotPosition,
  type SpotPositionLive,
} from "@/lib/portfolio/spot/SpotPosition";
import { isEffectivelyZero } from "@/lib/portfolio/sizing/PositionSizing";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";
import type { SpotTrade } from "@/lib/portfolio/spot/types";

/**
 * In-process SPOT position registry — source of truth for open position cards.
 */
export class SpotPositionRuntime {
  private readonly cache = new Map<string, SpotPosition[]>();
  private readonly tickUnsubs = new Map<string, () => void>();

  constructor(
    private readonly engine: SpotPositionEngine = spotPositionEngine,
    private readonly storage: SpotPositionStorage = spotPositionStorage,
  ) {}

  async start(
    walletId: string,
    options: { migrateIfMissing?: boolean } = {},
  ): Promise<void> {
    const migrateIfMissing = options.migrateIfMissing ?? true;
    let positions = await this.storage.load(walletId);

    if (positions.length === 0 && migrateIfMissing) {
      const ledger = await spotLedgerRuntime.start(walletId, {
        createIfMissing: true,
        initialUsdt: 0,
      });
      const state = ledger.getState() ?? (await ledger.load());
      if (
        state &&
        (state.balances.some((b) => b.asset !== "USDT" && b.total > 0) ||
          state.trades.length > 0)
      ) {
        positions = this.engine.migrateFromLedger(
          walletId,
          state.balances,
          state.trades,
        );
        await this.storage.save(walletId, positions);
      }
    }

    this.cache.set(walletId, positions);
    this.ensureTickListener(walletId);
    this.publishOpen(walletId);
  }

  async applyTrade(walletId: string, trade: SpotTrade): Promise<void> {
    const positions = await this.loadPositions(walletId);
    const next = this.engine.applyTrade(positions, trade);
    await this.persist(walletId, next);
  }

  listOpen(walletId: string): SpotPositionLive[] {
    const open = (this.cache.get(walletId) ?? []).filter(
      (p) =>
        p.status === "OPEN" &&
        p.quantity > 0 &&
        !isEffectivelyZero(p.symbol, p.quantity),
    );
    return withLiveMarks(open, (symbol) => marketTickStore.getPrice(symbol));
  }

  getOpenSnapshot(walletId: string): SpotPositionLive[] {
    return this.listOpen(walletId);
  }

  stop(walletId: string): void {
    this.cache.delete(walletId);
    const unsub = this.tickUnsubs.get(walletId);
    if (unsub) {
      unsub();
      this.tickUnsubs.delete(walletId);
    }
  }

  stopAll(): void {
    for (const walletId of [...this.cache.keys()]) {
      this.stop(walletId);
    }
  }

  private async loadPositions(walletId: string): Promise<SpotPosition[]> {
    if (this.cache.has(walletId)) {
      return [...(this.cache.get(walletId) ?? [])];
    }
    const loaded = await this.storage.load(walletId);
    this.cache.set(walletId, loaded);
    return [...loaded];
  }

  private async persist(walletId: string, positions: SpotPosition[]): Promise<void> {
    this.cache.set(walletId, positions);
    await this.storage.save(walletId, positions);
    this.publishOpen(walletId);
  }

  private publishOpen(walletId: string): void {
    spotLedgerStore.publishPositions(walletId, this.listOpen(walletId));
  }

  private ensureTickListener(walletId: string): void {
    if (this.tickUnsubs.has(walletId)) return;
    const unsub = marketTickStore.subscribe(() => {
      if (!this.cache.has(walletId)) return;
      this.publishOpen(walletId);
    });
    this.tickUnsubs.set(walletId, unsub);
  }
}

export const spotPositionRuntime = new SpotPositionRuntime();
