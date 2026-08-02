import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export class TrailingStopValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrailingStopValidationError";
  }
}

export function validateTrailingStopInput(input: {
  symbol: string;
  positionSide: PositionSide;
  quantity: number;
  callbackRate: number;
  activationPrice?: number | null;
  markPrice: number;
}): void {
  if (!input.symbol.trim()) {
    throw new TrailingStopValidationError("Symbol is required");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new TrailingStopValidationError("Quantity must be greater than zero");
  }
  if (!Number.isFinite(input.callbackRate) || input.callbackRate <= 0 || input.callbackRate >= 100) {
    throw new TrailingStopValidationError("Callback rate must be between 0 and 100");
  }
  if (!(input.markPrice > 0)) {
    throw new TrailingStopValidationError("Mark price must be positive");
  }
  if (
    input.activationPrice != null &&
    (!Number.isFinite(input.activationPrice) || input.activationPrice <= 0)
  ) {
    throw new TrailingStopValidationError("Activation price must be positive when set");
  }
}
