import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotLedgerStorage } from "@/lib/portfolio/spot/SpotLedgerStorage";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";
import type { SpotLedgerState } from "@/lib/portfolio/spot/types";

/**
 * In-process registry of SpotLedger instances per wallet.
 * Not connected to ExecutionRouter or PERP runtime (Phase 4).
 */
export class SpotLedgerRuntime {
  private readonly ledgers = new Map<string, SpotLedger>();

  /**
   * Starts (loads or creates) a spot ledger for the wallet.
   * Does not touch PERP PortfolioEngineRuntime.
   */
  async start(
    walletId: string,
    options: { initialUsdt?: number; createIfMissing?: boolean } = {},
  ): Promise<SpotLedger> {
    const existing = this.ledgers.get(walletId);
    if (existing) {
      await existing.load();
      return existing;
    }

    const ledger = new SpotLedger(walletId, spotLedgerStorage);
    const createIfMissing = options.createIfMissing ?? true;

    if (createIfMissing) {
      await ledger.loadOrCreate(options.initialUsdt ?? 0);
    } else {
      await ledger.load();
    }

    this.ledgers.set(walletId, ledger);
    const state = ledger.getState();
    if (state) {
      spotLedgerStore.sync(walletId, state);
    }
    return ledger;
  }

  stop(walletId: string): void {
    this.ledgers.delete(walletId);
  }

  stopAll(): void {
    this.ledgers.clear();
  }

  getLedger(walletId: string): SpotLedger | null {
    return this.ledgers.get(walletId) ?? null;
  }

  async getState(walletId: string): Promise<SpotLedgerState | null> {
    const ledger = this.ledgers.get(walletId);
    if (!ledger) return null;
    const state = ledger.getState() ?? (await ledger.load());
    if (state) {
      spotLedgerStore.sync(walletId, state);
    }
    return state;
  }

  isStarted(walletId: string): boolean {
    return this.ledgers.has(walletId);
  }
}

export const spotLedgerRuntime = new SpotLedgerRuntime();
