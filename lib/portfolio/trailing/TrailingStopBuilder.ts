import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import {
  closeSideForPositionLeg,
  createTrailingStopId,
  type TrailingStop,
} from "@/lib/portfolio/trailing/TrailingStop";
import { validateTrailingStopInput } from "@/lib/portfolio/trailing/TrailingStopValidator";

export function buildTrailingStop(input: {
  walletId: string;
  symbol: string;
  positionSide: PositionSide;
  quantity: number;
  callbackRate: number;
  activationPrice?: number | null;
  markPrice: number;
}): TrailingStop {
  validateTrailingStopInput(input);
  const now = Date.now();
  const mark = input.markPrice;

  return {
    id: createTrailingStopId(),
    walletId: input.walletId,
    symbol: input.symbol,
    positionSide: input.positionSide,
    side: closeSideForPositionLeg(input.positionSide),
    quantity: input.quantity,
    callbackRate: input.callbackRate,
    activationPrice: input.activationPrice ?? null,
    highestPrice: mark,
    lowestPrice: mark,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    triggeredAt: null,
  };
}
