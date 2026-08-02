import type { PositionSide } from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export const OCO_GROUP_STATUSES = [
  "ACTIVE",
  "PARTIALLY_FILLED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OcoGroupStatus = (typeof OCO_GROUP_STATUSES)[number];

export type OcoGroup = {
  id: string;
  walletId: string;
  symbol: string;
  /** Hedge leg — never symbol-only. */
  positionSide: PositionSide;
  takeProfitOrderId: string;
  stopLossOrderId: string;
  status: OcoGroupStatus;
  createdAt: number;
  updatedAt: number;
};

export type TradeTriggerReason = "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL" | "TRAILING_STOP";

export type OcoGroupSnapshotEntry = {
  id: string;
  symbol: string;
  side: PositionSide;
  status: OcoGroupStatus;
  takeProfit: {
    orderId: string;
    triggerPrice: number;
    quantity: number;
    orderStatus: string;
  } | null;
  stopLoss: {
    orderId: string;
    triggerPrice: number;
    quantity: number;
    orderStatus: string;
  } | null;
};

export function createOcoGroupId(): string {
  return `oco_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isActiveOcoStatus(status: OcoGroupStatus): boolean {
  return status === "ACTIVE" || status === "PARTIALLY_FILLED";
}

export function hydrateOcoGroup(group: OcoGroup): OcoGroup {
  return {
    ...group,
    status: OCO_GROUP_STATUSES.includes(group.status) ? group.status : "CANCELLED",
  };
}
