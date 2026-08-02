import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import type { TradeSide } from "@/lib/portfolio/types";

export const TRAILING_STOP_STATUSES = ["ACTIVE", "TRIGGERED", "CANCELLED"] as const;

export type TrailingStopStatus = (typeof TRAILING_STOP_STATUSES)[number];

export type TrailingStop = {
  id: string;
  walletId: string;
  symbol: string;
  positionSide: PositionSide;
  /** Close side — SELL for LONG leg, BUY for SHORT leg. */
  side: TradeSide;
  quantity: number;
  /** Callback distance in percent (e.g. 1.5 = 1.5%). */
  callbackRate: number;
  activationPrice: number | null;
  highestPrice: number;
  lowestPrice: number;
  status: TrailingStopStatus;
  createdAt: number;
  updatedAt: number;
  triggeredAt: number | null;
};

export type TrailingStopSnapshotEntry = {
  id: string;
  symbol: string;
  side: PositionSide;
  callbackRate: number;
  activationPrice: number | null;
  highestPrice: number;
  lowestPrice: number;
  quantity: number;
  status: TrailingStopStatus;
};

export function createTrailingStopId(): string {
  return `trail_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isActiveTrailingStatus(status: TrailingStopStatus): boolean {
  return status === "ACTIVE";
}

export function hydrateTrailingStop(stop: TrailingStop): TrailingStop {
  return {
    ...stop,
    status: TRAILING_STOP_STATUSES.includes(stop.status) ? stop.status : "CANCELLED",
    activationPrice: stop.activationPrice ?? null,
    triggeredAt: stop.triggeredAt ?? null,
  };
}

export function closeSideForPositionLeg(positionSide: PositionSide): TradeSide {
  return positionSide === "LONG" ? "SELL" : "BUY";
}
