/**
 * SPOT position read model — asset ownership, no leverage/margin/liquidation.
 * Distinct from PERP Position / PositionEngine.
 */

export type SpotPositionStatus = "OPEN" | "CLOSED";

/** Persisted spot holding — one live row per symbol per wallet. */
export type SpotPosition = {
  id: string;
  walletId: string;
  domain: "SPOT";
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantity: number;
  averageEntry: number;
  realizedPnL: number;
  status: SpotPositionStatus;
  createdAt: number;
  updatedAt: number;
};

/** Live projection — mark fields updated from MarketTickStore only. */
export type SpotPositionLive = SpotPosition & {
  marketPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
};

export function createSpotPositionId(): string {
  return `spot_pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createOpenSpotPosition(args: {
  walletId: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  quantity: number;
  averageEntry: number;
  now?: number;
}): SpotPosition {
  const now = args.now ?? Date.now();
  return {
    id: createSpotPositionId(),
    walletId: args.walletId,
    domain: "SPOT",
    symbol: args.symbol,
    baseAsset: args.baseAsset,
    quoteAsset: args.quoteAsset,
    quantity: args.quantity,
    averageEntry: args.averageEntry,
    realizedPnL: 0,
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  };
}

/** Apply live mark — does not mutate averageEntry or realizedPnL. */
export function withLiveMark(
  position: SpotPosition,
  marketPrice: number | null,
): SpotPositionLive {
  const mark = marketPrice != null && marketPrice > 0 ? marketPrice : 0;
  const qty = position.quantity;
  const marketValue = qty * mark;
  const costBasis = qty * position.averageEntry;
  const unrealizedPnL =
    position.status === "OPEN" && mark > 0 ? (mark - position.averageEntry) * qty : 0;
  const unrealizedPnLPercent =
    costBasis > 0 ? Number(((unrealizedPnL / costBasis) * 100).toFixed(2)) : 0;

  return {
    ...position,
    marketPrice: mark,
    marketValue,
    unrealizedPnL,
    unrealizedPnLPercent,
  };
}

export function withLiveMarks(
  positions: SpotPosition[],
  getPrice: (symbol: string) => number | null,
): SpotPositionLive[] {
  return positions.map((position) =>
    position.status === "OPEN"
      ? withLiveMark(position, getPrice(position.symbol))
      : withLiveMark(position, 0),
  );
}
