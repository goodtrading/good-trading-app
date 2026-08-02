import { createSpotBalance, type SpotBalance } from "@/lib/portfolio/spot/types";

export function cloneBalances(balances: SpotBalance[]): SpotBalance[] {
  return balances.map((b) => createSpotBalance(b.asset, b.free, b.locked));
}

export function findBalance(
  balances: SpotBalance[],
  asset: string,
): SpotBalance | undefined {
  return balances.find((b) => b.asset === asset);
}

export function getOrCreateBalance(
  balances: SpotBalance[],
  asset: string,
): SpotBalance {
  const existing = findBalance(balances, asset);
  if (existing) return existing;
  const created = createSpotBalance(asset, 0, 0);
  balances.push(created);
  return created;
}

export function pruneZeroBalances(balances: SpotBalance[]): SpotBalance[] {
  return balances.filter((b) => b.free !== 0 || b.locked !== 0);
}

export function recomputeTotals(balances: SpotBalance[]): void {
  for (const b of balances) {
    b.total = b.free + b.locked;
  }
}
