import {
  DEFAULT_REDUCE_ONLY_POLICY,
  type ReduceOnlyPolicy,
} from "@/lib/portfolio/reduceOnly/ReduceOnlyPolicy";
import type { TradeSide } from "@/lib/portfolio/types";

export class ReduceOnlyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReduceOnlyValidationError";
  }
}

export type ReduceOnlyValidationResult = {
  allowed: boolean;
  executableQuantity: number;
  reason?: string;
};

export type ReduceOnlyQuantityMode = "SIGNED_NET" | "LEG_ABSOLUTE";

function hasOpenPosition(positionQuantity: number): boolean {
  return Number.isFinite(positionQuantity) && positionQuantity !== 0;
}

/** Max quantity reducible on the given side; 0 when the side would increase exposure. */
function maxReducibleForSide(
  positionQuantity: number,
  side: TradeSide,
  quantityMode: ReduceOnlyQuantityMode = "SIGNED_NET",
): number {
  if (quantityMode === "LEG_ABSOLUTE") {
    return positionQuantity > 0 ? positionQuantity : 0;
  }
  if (positionQuantity > 0 && side === "SELL") return positionQuantity;
  if (positionQuantity < 0 && side === "BUY") return Math.abs(positionQuantity);
  return 0;
}

/**
 * True when the fill would open, add to, or flip the position (never allowed for reduce-only).
 */
export function wouldIncreaseExposure(
  positionQuantity: number,
  side: TradeSide,
  requestedQuantity: number,
  quantityMode: ReduceOnlyQuantityMode = "SIGNED_NET",
): boolean {
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) return true;
  if (!hasOpenPosition(positionQuantity)) return true;

  const maxReducible = maxReducibleForSide(positionQuantity, side, quantityMode);
  if (maxReducible === 0) return true;

  return requestedQuantity > maxReducible;
}

/** Caps requested quantity to the reducible amount on the correct side (0 when invalid side). */
export function clampReduceOnlyQuantity(
  positionQuantity: number,
  side: TradeSide,
  requestedQuantity: number,
  quantityMode: ReduceOnlyQuantityMode = "SIGNED_NET",
): number {
  const maxReducible = maxReducibleForSide(positionQuantity, side, quantityMode);
  if (maxReducible === 0) return 0;
  return Math.min(requestedQuantity, maxReducible);
}

export function canExecuteReduceOnly(
  positionQuantity: number,
  side: TradeSide,
  requestedQuantity: number,
): boolean {
  return clampReduceOnlyQuantity(positionQuantity, side, requestedQuantity) > 0;
}

export function resolveMaxReducibleQuantity(positionQuantity: number): number {
  if (!hasOpenPosition(positionQuantity)) return 0;
  return Math.abs(positionQuantity);
}

export function resolveCanReduce(positionQuantity: number): boolean {
  return resolveMaxReducibleQuantity(positionQuantity) > 0;
}

export function validateReduceOnly(input: {
  positionQuantity: number;
  side: TradeSide;
  requestedQuantity: number;
  policy?: ReduceOnlyPolicy;
  quantityMode?: ReduceOnlyQuantityMode;
}): ReduceOnlyValidationResult {
  const policy = input.policy ?? DEFAULT_REDUCE_ONLY_POLICY;
  const quantityMode = input.quantityMode ?? "SIGNED_NET";
  const { positionQuantity, side, requestedQuantity } = input;

  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return {
      allowed: false,
      executableQuantity: 0,
      reason: "Quantity must be greater than zero",
    };
  }

  if (!hasOpenPosition(positionQuantity)) {
    return {
      allowed: false,
      executableQuantity: 0,
      reason: "No open position to reduce",
    };
  }

  const maxReducible = maxReducibleForSide(positionQuantity, side, quantityMode);
  if (maxReducible === 0) {
    return {
      allowed: false,
      executableQuantity: 0,
      reason: "Order side would increase exposure",
    };
  }

  if (policy.mode === "REJECT" && requestedQuantity > maxReducible) {
    return {
      allowed: false,
      executableQuantity: 0,
      reason: `Reduce-only quantity ${requestedQuantity} exceeds position ${maxReducible}`,
    };
  }

  const executableQuantity = clampReduceOnlyQuantity(
    positionQuantity,
    side,
    requestedQuantity,
    quantityMode,
  );

  return { allowed: true, executableQuantity };
}

/** Validates reduce-only constraints and returns the executable quantity. */
export function assertReduceOnlyExecution(input: {
  positionQuantity: number;
  side: TradeSide;
  requestedQuantity: number;
  policy?: ReduceOnlyPolicy;
  quantityMode?: ReduceOnlyQuantityMode;
}): number {
  const result = validateReduceOnly(input);
  if (!result.allowed || result.executableQuantity <= 0) {
    throw new ReduceOnlyValidationError(result.reason ?? "Reduce only order rejected");
  }
  return result.executableQuantity;
}
