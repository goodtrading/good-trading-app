import {
  createOpenSpotPosition,
  type SpotPosition,
} from "@/lib/portfolio/spot/SpotPosition";
import {
  isEffectivelyZero,
  normalizeQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import type { SpotBalance, SpotTrade } from "@/lib/portfolio/spot/types";

/**
 * SPOT position mutations — read model only, never touches PERP stack.
 */
export class SpotPositionEngine {
  applyTrade(positions: SpotPosition[], trade: SpotTrade): SpotPosition[] {
    const symbol = `${trade.baseAsset}${trade.quoteAsset}`;
    const now = Date.now();
    const list = [...positions];
    const index = list.findIndex(
      (p) => p.symbol === symbol && p.status === "OPEN",
    );

    if (trade.side === "BUY") {
      if (index < 0) {
        list.push(
          createOpenSpotPosition({
            walletId: trade.walletId,
            symbol,
            baseAsset: trade.baseAsset,
            quoteAsset: trade.quoteAsset,
            quantity: trade.quantity,
            averageEntry: trade.price,
            now,
          }),
        );
        return list;
      }

      const current = list[index]!;
      const newQty = current.quantity + trade.quantity;
      const newAvg =
        (current.quantity * current.averageEntry + trade.quantity * trade.price) /
        newQty;

      list[index] = {
        ...current,
        quantity: newQty,
        averageEntry: newAvg,
        status: "OPEN",
        updatedAt: now,
      };
      return list;
    }

    if (index < 0) {
      return list;
    }

    const current = list[index]!;
    const sellQty = Math.min(trade.quantity, current.quantity);
    const realizedDelta = (trade.price - current.averageEntry) * sellQty;
    const newQty = normalizeQuantity(symbol, current.quantity - sellQty);

    if (isEffectivelyZero(symbol, newQty)) {
      list[index] = {
        ...current,
        quantity: 0,
        realizedPnL: current.realizedPnL + realizedDelta,
        status: "CLOSED",
        updatedAt: now,
      };
      return list;
    }

    list[index] = {
      ...current,
      quantity: newQty,
      realizedPnL: current.realizedPnL + realizedDelta,
      status: "OPEN",
      updatedAt: now,
    };
    return list;
  }

  /**
   * One-time bootstrap from ledger balances + trade history.
   */
  migrateFromLedger(
    walletId: string,
    balances: SpotBalance[],
    trades: SpotTrade[],
  ): SpotPosition[] {
    const now = Date.now();
    const positions: SpotPosition[] = [];

    for (const balance of balances) {
      if (balance.asset === "USDT" || balance.total <= 0) continue;
      const symbol = `${balance.asset}USDT`;
      if (isEffectivelyZero(symbol, balance.total)) continue;
      const averageEntry = averageCostFromTrades(trades, balance.asset);
      positions.push(
        createOpenSpotPosition({
          walletId,
          symbol: `${balance.asset}USDT`,
          baseAsset: balance.asset,
          quoteAsset: "USDT",
          quantity: balance.total,
          averageEntry,
          now,
        }),
      );
    }

    return positions;
  }
}

function averageCostFromTrades(trades: SpotTrade[], baseAsset: string): number {
  let quantity = 0;
  let cost = 0;
  const sorted = [...trades]
    .filter((t) => t.baseAsset === baseAsset)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const trade of sorted) {
    if (trade.side === "BUY") {
      cost += trade.quantity * trade.price;
      quantity += trade.quantity;
      continue;
    }
    if (quantity <= 0) continue;
    const avg = cost / quantity;
    const sold = Math.min(trade.quantity, quantity);
    cost -= sold * avg;
    quantity -= sold;
  }

  return quantity > 0 ? cost / quantity : 0;
}

export const spotPositionEngine = new SpotPositionEngine();
