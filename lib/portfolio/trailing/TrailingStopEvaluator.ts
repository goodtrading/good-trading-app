import type { TrailingStop } from "@/lib/portfolio/trailing/TrailingStop";

/** True when optional activation price has been reached. */
export function isTrailingActivated(trailing: TrailingStop, markPrice: number): boolean {
  if (trailing.activationPrice == null) return true;
  if (trailing.positionSide === "LONG") {
    return markPrice >= trailing.activationPrice;
  }
  return markPrice <= trailing.activationPrice;
}

/**
 * Updates trailing extremes after activation.
 * LONG → tracks highestPrice; SHORT → tracks lowestPrice.
 */
export function applyTrailingMarkUpdate(
  trailing: TrailingStop,
  markPrice: number,
): TrailingStop | null {
  if (!isTrailingActivated(trailing, markPrice)) {
    return null;
  }

  if (trailing.positionSide === "LONG") {
    const baseHigh =
      trailing.activationPrice != null && trailing.highestPrice < trailing.activationPrice
        ? markPrice
        : trailing.highestPrice;
    const nextHigh = Math.max(baseHigh, markPrice);
    if (nextHigh === trailing.highestPrice) return null;
    return { ...trailing, highestPrice: nextHigh, updatedAt: Date.now() };
  }

  const baseLow =
    trailing.activationPrice != null && trailing.lowestPrice > trailing.activationPrice
      ? markPrice
      : trailing.lowestPrice;
  const nextLow = Math.min(baseLow, markPrice);
  if (nextLow === trailing.lowestPrice) return null;
  return { ...trailing, lowestPrice: nextLow, updatedAt: Date.now() };
}

/** Trigger when price retraces callbackRate from the tracked extreme. */
export function shouldTriggerTrailing(trailing: TrailingStop, markPrice: number): boolean {
  if (!isTrailingActivated(trailing, markPrice)) return false;

  const rate = trailing.callbackRate / 100;

  if (trailing.positionSide === "LONG") {
    const triggerPrice = trailing.highestPrice * (1 - rate);
    return markPrice <= triggerPrice;
  }

  const triggerPrice = trailing.lowestPrice * (1 + rate);
  return markPrice >= triggerPrice;
}

export function trailingTriggerPrice(trailing: TrailingStop): number {
  const rate = trailing.callbackRate / 100;
  if (trailing.positionSide === "LONG") {
    return trailing.highestPrice * (1 - rate);
  }
  return trailing.lowestPrice * (1 + rate);
}
