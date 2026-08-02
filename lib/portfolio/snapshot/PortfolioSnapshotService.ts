import type { Order } from "@/lib/portfolio/orders/OrderEngine";
import type {
  PortfolioEngineState,
  Position,
  PositionMode,
  Trade,
} from "@/lib/portfolio/types";

export const ENGINE_VERSION = "cartera-engine-v1";

export type RiskSchedulerSnapshotState = {
  running: boolean;
};

export type PortfolioRuntimeConfigSnapshot = {
  leverage: number;
  positionMode: PositionMode;
  riskScheduler: RiskSchedulerSnapshotState;
};

export type PortfolioEngineSnapshotInput = {
  accountId: string;
  reason: string;
  engineState: PortfolioEngineState;
  openOrders: Order[];
  leverage: number;
  positionMode: PositionMode;
  riskScheduler: RiskSchedulerSnapshotState;
  engineVersion?: string;
};

export type PortfolioEngineSnapshot = {
  id: string;
  createdAt: number;
  reason: string;
  accountId: string;
  engineVersion: string;
  engineState: PortfolioEngineState;
  trades: Trade[];
  positions: Position[];
  openOrders: Order[];
  leverage: number;
  positionMode: PositionMode;
  riskSchedulerState: RiskSchedulerSnapshotState;
  runtimeConfig: PortfolioRuntimeConfigSnapshot;
};

function createSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory snapshot store for PortfolioEngine state.
 * No UI persistence in this phase.
 */
export class PortfolioSnapshotService {
  private readonly snapshots: PortfolioEngineSnapshot[] = [];
  private readonly latestByAccount = new Map<string, string>();

  createSnapshot(input: PortfolioEngineSnapshotInput): PortfolioEngineSnapshot {
    const snapshot: PortfolioEngineSnapshot = {
      id: createSnapshotId(),
      createdAt: Date.now(),
      reason: input.reason,
      accountId: input.accountId,
      engineVersion: input.engineVersion ?? ENGINE_VERSION,
      engineState: {
        ...input.engineState,
        portfolio: { ...input.engineState.portfolio },
        positions: input.engineState.positions.map((position) => ({ ...position })),
        trades: input.engineState.trades.map((trade) => ({ ...trade })),
      },
      trades: input.engineState.trades.map((trade) => ({ ...trade })),
      positions: input.engineState.positions.map((position) => ({ ...position })),
      openOrders: input.openOrders.map((order) => ({ ...order })),
      leverage: input.leverage,
      positionMode: input.positionMode,
      riskSchedulerState: { ...input.riskScheduler },
      runtimeConfig: {
        leverage: input.leverage,
        positionMode: input.positionMode,
        riskScheduler: { ...input.riskScheduler },
      },
    };

    this.snapshots.push(snapshot);
    this.latestByAccount.set(input.accountId, snapshot.id);

    console.log("[ENGINE SNAPSHOT CREATED]", {
      id: snapshot.id,
      accountId: snapshot.accountId,
      reason: snapshot.reason,
      tradeCount: snapshot.trades.length,
      positionCount: snapshot.positions.length,
    });

    return snapshot;
  }

  getLatest(accountId?: string): PortfolioEngineSnapshot | null {
    if (accountId) {
      const id = this.latestByAccount.get(accountId);
      return id ? this.getById(id) : null;
    }

    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  getById(id: string): PortfolioEngineSnapshot | null {
    return this.snapshots.find((snapshot) => snapshot.id === id) ?? null;
  }

  list(accountId?: string): PortfolioEngineSnapshot[] {
    const items = accountId
      ? this.snapshots.filter((snapshot) => snapshot.accountId === accountId)
      : [...this.snapshots];
    return items.sort((left, right) => right.createdAt - left.createdAt);
  }

  /** Test helper. */
  clear(): void {
    this.snapshots.length = 0;
    this.latestByAccount.clear();
  }
}

export function createPortfolioSnapshotService(): PortfolioSnapshotService {
  return new PortfolioSnapshotService();
}
