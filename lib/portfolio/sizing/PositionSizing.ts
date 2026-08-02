import { entryMarginForPosition } from "@/lib/portfolio/futures/futuresAccounting";
import {
  dustEpsilon,
  getSymbolRules,
  stepFloorBias,
} from "@/lib/portfolio/symbols/symbolRules";
import { quantityFromMargin } from "@/lib/portfolio/trade/tradeEntryCalculations";

export type CanonicalClosePosition = {
  symbol: string;
  quantity: number;
};

export type CloseQuantityValidation = {
  valid: boolean;
  normalizedQuantity: number;
  canonicalPositionQuantity: number;
  executableQuantity: number;
  isFullClose: boolean;
  isPartialClose: boolean;
  exceedsPosition: boolean;
};

function stepDecimalPlaces(stepSize: number): number {
  const text = stepSize.toFixed(20).replace(/\.?0+$/, "");
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Floor to cents — avoids float margin exceeding available balance. */
export function roundMoneyDown(value: number, decimals = 2): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** decimals;
  const bias = 10 ** -decimals;
  return Math.floor(value * factor + bias) / factor;
}

/** Round quantity down to symbol stepSize. */
export function roundToStep(symbol: string, quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const { stepSize } = getSymbolRules(symbol);
  if (!(stepSize > 0)) return quantity;
  const bias = stepFloorBias(symbol);
  const steps = Math.floor((quantity + bias) / stepSize);
  if (steps <= 0) return 0;
  const decimals = stepDecimalPlaces(stepSize);
  return Number((steps * stepSize).toFixed(decimals));
}

/** True when quantity is below minQty or dust epsilon for the symbol. */
export function isEffectivelyZero(symbol: string, quantity: number): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) return true;
  const { minQty } = getSymbolRules(symbol);
  const eps = dustEpsilon(symbol);
  return quantity <= eps || quantity < minQty;
}

/** Round to step and collapse dust to zero. */
export function normalizeQuantity(symbol: string, quantity: number): number {
  const rounded = roundToStep(symbol, quantity);
  return isEffectivelyZero(symbol, rounded) ? 0 : rounded;
}

/**
 * Canonical full-close quantity — single source of truth for 100% / MAX exits.
 * Never reads wallet free/locked balances.
 */
export function resolveCanonicalCloseQuantity(
  position: CanonicalClosePosition,
): number {
  return normalizeQuantity(position.symbol, position.quantity);
}

/** Display / input string for a close quantity at symbol step precision. */
export function formatCloseQuantity(symbol: string, quantity: number): string {
  const normalized = normalizeQuantity(symbol, quantity);
  if (normalized <= 0) return "";
  const { stepSize } = getSymbolRules(symbol);
  const decimals = stepDecimalPlaces(stepSize);
  const fixed = normalized.toFixed(decimals);
  if (decimals === 0) return fixed;
  return fixed.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/**
 * Single validation entry point for close flows (SPOT + PERP).
 * Compares only normalized quantities — never raw position.quantity.
 */
export function validateCloseQuantity(
  position: CanonicalClosePosition,
  quantity: number | null,
): CloseQuantityValidation {
  const canonicalPositionQuantity = resolveCanonicalCloseQuantity(position);

  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      valid: false,
      normalizedQuantity: 0,
      canonicalPositionQuantity,
      executableQuantity: 0,
      isFullClose: false,
      isPartialClose: false,
      exceedsPosition: false,
    };
  }

  const normalizedQuantity = normalizeQuantity(position.symbol, quantity);
  const exceedsPosition =
    canonicalPositionQuantity <= 0
      ? normalizedQuantity > 0
      : normalizedQuantity > canonicalPositionQuantity;

  if (normalizedQuantity <= 0) {
    return {
      valid: false,
      normalizedQuantity: 0,
      canonicalPositionQuantity,
      executableQuantity: 0,
      isFullClose: false,
      isPartialClose: false,
      exceedsPosition,
    };
  }

  if (exceedsPosition) {
    return {
      valid: false,
      normalizedQuantity,
      canonicalPositionQuantity,
      executableQuantity: 0,
      isFullClose: false,
      isPartialClose: false,
      exceedsPosition: true,
    };
  }

  const isFullClose =
    canonicalPositionQuantity > 0 &&
    normalizedQuantity === canonicalPositionQuantity;

  return {
    valid: true,
    normalizedQuantity,
    canonicalPositionQuantity,
    executableQuantity: normalizedQuantity,
    isFullClose,
    isPartialClose: !isFullClose,
    exceedsPosition: false,
  };
}

/** Quantity for a close-percent slider (100% → canonical full close). */
export function closeQuantityFromPercent(
  symbol: string,
  positionQuantity: number,
  percent: number,
): number {
  return quantityFromClosePercent(symbol, positionQuantity, percent);
}

/** MAX / 100% close — always canonical position quantity. */
export function maxCloseQuantity(position: CanonicalClosePosition): number {
  return resolveCanonicalCloseQuantity(position);
}

/** Cap requested quantity to open position size (position is source of truth for closes). */
export function clampToPosition(
  symbol: string,
  quantity: number,
  positionQuantity: number,
): number {
  if (!(positionQuantity > 0)) return 0;
  const capped = Math.min(quantity, positionQuantity);
  return normalizeQuantity(symbol, capped);
}

/** Cap quantity to a free balance (opens / buys only — never used for position closes). */
export function clampToBalance(
  symbol: string,
  quantity: number,
  freeBalance: number,
): number {
  if (!(freeBalance > 0)) return 0;
  const capped = Math.min(quantity, freeBalance);
  return normalizeQuantity(symbol, capped);
}

export function isHundredPercent(percent: number): boolean {
  return percent >= 100;
}

/** Partial close sizing — position quantity only, never wallet free. */
export function quantityFromClosePercent(
  symbol: string,
  positionQuantity: number,
  percent: number,
): number {
  if (!(positionQuantity > 0)) return 0;
  const clamped = Math.min(100, Math.max(0, percent));
  if (isHundredPercent(clamped)) {
    return resolveCanonicalCloseQuantity({ symbol, quantity: positionQuantity });
  }
  const raw = positionQuantity * (clamped / 100);
  return normalizeQuantity(symbol, raw);
}

/** @deprecated Use validateCloseQuantity().isFullClose */
export function isFullClose(
  symbol: string,
  quantity: number,
  positionQuantity: number,
): boolean {
  return validateCloseQuantity(
    { symbol, quantity: positionQuantity },
    quantity,
  ).isFullClose;
}

/** @deprecated Use validateCloseQuantity().exceedsPosition */
export function exceedsPositionQuantity(
  symbol: string,
  quantity: number,
  positionQuantity: number,
): boolean {
  return validateCloseQuantity(
    { symbol, quantity: positionQuantity },
    quantity,
  ).exceedsPosition;
}

/** MAX SPOT sell — canonical position quantity. */
export function maxSpotSellQuantity(
  symbol: string,
  positionQuantity: number,
): number {
  return maxCloseQuantity({ symbol, quantity: positionQuantity });
}

/**
 * Max initial margin for a new/increasing leg at `leverage` that fits `availableBalance`.
 * Mirrors engine rule: additionalMargin = qty × price / leverage ≤ available.
 */
export function maxOrderMarginFromAvailable(args: {
  availableBalance: number;
  price: number;
  leverage: number;
  symbol: string;
}): number {
  const { availableBalance, price, leverage, symbol } = args;
  if (!(availableBalance > 0) || !(price > 0) || !(leverage > 0)) {
    return 0;
  }

  const maxQty = (availableBalance * leverage) / price;
  if (!(maxQty > 0)) return 0;

  const qty = roundToStep(symbol, maxQty);
  if (qty <= 0) return 0;

  const margin = entryMarginForPosition(qty, price, leverage);
  const capped = Math.min(margin, availableBalance);
  return roundMoneyDown(capped);
}

/** Margin → qty → margin round-trip — MAX PERP must stay inside engine guards. */
export function maxPerpExecutableMargin(args: {
  availableBalance: number;
  price: number;
  leverage: number;
  symbol: string;
}): number {
  let margin = maxOrderMarginFromAvailable(args);
  if (margin <= 0) return 0;

  const cent = 0.01;
  for (let i = 0; i < 8; i++) {
    const qty = quantityFromMargin({
      margin,
      leverage: args.leverage,
      price: args.price,
    });
    if (qty == null || qty <= 0) break;
    const required = entryMarginForPosition(qty, args.price, args.leverage);
    if (required <= roundMoneyDown(args.availableBalance)) {
      return margin;
    }
    margin = roundMoneyDown(margin - cent);
  }

  return 0;
}
