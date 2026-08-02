/**
 * @deprecated Import from `@/lib/portfolio/sizing/PositionSizing` instead.
 */
export {
  clampToBalance,
  clampToPosition,
  closeQuantityFromPercent,
  exceedsPositionQuantity,
  formatCloseQuantity,
  isEffectivelyZero,
  isFullClose,
  isHundredPercent,
  maxCloseQuantity,
  maxSpotSellQuantity,
  normalizeQuantity,
  quantityFromClosePercent,
  resolveCanonicalCloseQuantity,
  roundToStep,
  validateCloseQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";

import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import type { SpotBalance } from "@/lib/portfolio/spot/types";
import {
  closeQuantityFromPercent,
  resolveCanonicalCloseQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";

/** Free base asset in SpotLedger (excludes locked order collateral). */
export function resolveSpotFreeBase(
  balances: SpotBalance[],
  baseAsset: string,
): number {
  return balances.find((b) => b.asset === baseAsset)?.free ?? 0;
}

/** Open position quantity from SpotPosition read model. */
export function resolveSpotPositionQuantity(
  positions: SpotPositionLive[],
  symbol: string,
): number {
  const position = positions.find((p) => p.symbol === symbol && p.status === "OPEN");
  if (!position || position.quantity <= 0) return 0;
  return resolveCanonicalCloseQuantity({
    symbol,
    quantity: position.quantity,
  });
}

/** @deprecated Use closeQuantityFromPercent from PositionSizing. */
export function resolveSpotCloseQuantity(args: {
  positionQuantity: number;
  freeBase: number;
  percent: number;
  symbol?: string;
}): number {
  const symbol = args.symbol ?? "BTCUSDT";
  return closeQuantityFromPercent(symbol, args.positionQuantity, args.percent);
}

/** @deprecated Use resolveCanonicalCloseQuantity from PositionSizing. */
export function resolveSpotSellMaxQuantity(args: {
  positionQuantity: number;
  freeBase: number;
  symbol?: string;
}): number {
  const symbol = args.symbol ?? "BTCUSDT";
  return resolveCanonicalCloseQuantity({
    symbol,
    quantity: args.positionQuantity,
  });
}
