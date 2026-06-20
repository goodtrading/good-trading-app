import type {
  PortfolioBalance,
  PortfolioPosition,
  PortfolioProvider,
  PortfolioSnapshot,
  PortfolioSourceId,
} from "./types";
import { getSourceMeta } from "./sourceCatalog";

const MOCK_LATENCY_MS = 180;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), MOCK_LATENCY_MS);
  });
}

function scalePositions(
  positions: PortfolioPosition[],
  targetTotal: number,
): PortfolioPosition[] {
  const currentTotal = positions.reduce((sum, p) => sum + p.valueUSD, 0);
  if (currentTotal <= 0) return positions;

  const ratio = targetTotal / currentTotal;
  return positions.map((position) => {
    const valueUSD = Number((position.valueUSD * ratio).toFixed(2));
    const pnl = Number((position.pnl * ratio).toFixed(2));
    return { ...position, valueUSD, pnl };
  });
}

function buildSnapshot(
  totalValueUSD: number,
  todayPnl: number,
  positions: PortfolioPosition[],
): PortfolioSnapshot {
  const todayPnlPercent =
    totalValueUSD > 0 ? Number(((todayPnl / totalValueUSD) * 100).toFixed(2)) : 0;

  return {
    balance: {
      totalValueUSD,
      todayPnl,
      todayPnlPercent,
    },
    positions,
  };
}

const PAPER_POSITIONS: PortfolioPosition[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "spot",
    quantity: 0.08,
    entryPrice: 79000,
    currentPrice: 82200,
    valueUSD: 6576,
    pnl: 256,
    pnlPercent: 4.05,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "spot",
    quantity: 1.1,
    entryPrice: 1900,
    currentPrice: 1842,
    valueUSD: 2026.2,
    pnl: -63.8,
    pnlPercent: -3.05,
  },
  {
    symbol: "USDT",
    name: "Tether",
    type: "usdt",
    quantity: 1397.8,
    entryPrice: 1,
    currentPrice: 1,
    valueUSD: 1397.8,
    pnl: 0,
    pnlPercent: 0,
  },
];

const BINANCE_POSITIONS: PortfolioPosition[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    type: "spot",
    quantity: 0.22,
    entryPrice: 78500,
    currentPrice: 82200,
    valueUSD: 18084,
    pnl: 814,
    pnlPercent: 4.71,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    type: "spot",
    quantity: 4.5,
    entryPrice: 1950,
    currentPrice: 1842,
    valueUSD: 8289,
    pnl: -486,
    pnlPercent: -5.54,
  },
  {
    symbol: "BTC",
    name: "Bitcoin Perp",
    type: "futures",
    quantity: 0.05,
    entryPrice: 83000,
    currentPrice: 82200,
    valueUSD: 4110,
    pnl: -40,
    pnlPercent: -0.96,
  },
  {
    symbol: "USDT",
    name: "Tether",
    type: "usdt",
    quantity: 9517,
    entryPrice: 1,
    currentPrice: 1,
    valueUSD: 9517,
    pnl: 0,
    pnlPercent: 0,
  },
];

const BINGX_POSITIONS: PortfolioPosition[] = [
  {
    symbol: "SOL",
    name: "Solana",
    type: "spot",
    quantity: 28,
    entryPrice: 105,
    currentPrice: 118.4,
    valueUSD: 3315.2,
    pnl: 375.2,
    pnlPercent: 12.76,
  },
  {
    symbol: "ETH",
    name: "Ethereum Perp",
    type: "futures",
    quantity: 1.2,
    entryPrice: 1780,
    currentPrice: 1842,
    valueUSD: 2210.4,
    pnl: 74.4,
    pnlPercent: 3.48,
  },
  {
    symbol: "USDT",
    name: "Tether",
    type: "usdt",
    quantity: 1974.4,
    entryPrice: 1,
    currentPrice: 1,
    valueUSD: 1974.4,
    pnl: 0,
    pnlPercent: 0,
  },
];

const MOCK_SNAPSHOTS: Record<Exclude<PortfolioSourceId, "all">, PortfolioSnapshot> = {
  paper: buildSnapshot(10_000, 192.2, PAPER_POSITIONS),
  binance: buildSnapshot(25_000, 288, BINANCE_POSITIONS),
  bingx: buildSnapshot(7_500, 449.6, BINGX_POSITIONS),
};

function createMockProvider(id: Exclude<PortfolioSourceId, "all">): PortfolioProvider {
  const snapshot = MOCK_SNAPSHOTS[id];

  return {
    meta: getSourceMeta(id),
    async getBalance(): Promise<PortfolioBalance> {
      return delay(snapshot.balance);
    },
    async getPositions(): Promise<PortfolioPosition[]> {
      return delay(snapshot.positions);
    },
    async getSnapshot(): Promise<PortfolioSnapshot> {
      return delay(snapshot);
    },
  };
}

/** Future consolidated provider aggregates every connected source. */
export function createConsolidatedProvider(
  providers: PortfolioProvider[],
): PortfolioProvider {
  return {
    meta: getSourceMeta("all"),
    async getBalance(): Promise<PortfolioBalance> {
      const snapshots = await Promise.all(providers.map((p) => p.getSnapshot()));
      const totalValueUSD = snapshots.reduce((sum, s) => sum + s.balance.totalValueUSD, 0);
      const todayPnl = snapshots.reduce((sum, s) => sum + s.balance.todayPnl, 0);
      const todayPnlPercent =
        totalValueUSD > 0 ? Number(((todayPnl / totalValueUSD) * 100).toFixed(2)) : 0;
      return delay({ totalValueUSD, todayPnl, todayPnlPercent });
    },
    async getPositions(): Promise<PortfolioPosition[]> {
      const snapshots = await Promise.all(providers.map((p) => p.getSnapshot()));
      return delay(snapshots.flatMap((s) => s.positions));
    },
    async getSnapshot(): Promise<PortfolioSnapshot> {
      const balance = await this.getBalance();
      const positions = await this.getPositions();
      return { balance, positions };
    },
  };
}

export const mockPortfolioProviders: Record<Exclude<PortfolioSourceId, "all">, PortfolioProvider> = {
  paper: createMockProvider("paper"),
  binance: createMockProvider("binance"),
  bingx: createMockProvider("bingx"),
};

export function getMockSnapshot(id: PortfolioSourceId): PortfolioSnapshot | null {
  if (id === "all") {
    return null;
  }
  return MOCK_SNAPSHOTS[id];
}

/** Utility for tests — rescale positions to a target total. */
export function rescaleSnapshotTotal(
  snapshot: PortfolioSnapshot,
  targetTotal: number,
): PortfolioSnapshot {
  const positions = scalePositions(snapshot.positions, targetTotal);
  const ratio = targetTotal / Math.max(snapshot.balance.totalValueUSD, 1);
  return buildSnapshot(
    targetTotal,
    Number((snapshot.balance.todayPnl * ratio).toFixed(2)),
    positions,
  );
}
