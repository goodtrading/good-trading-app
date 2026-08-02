/**
 * PERP domain contracts (Phase 2 — types only).
 * Aligns with the existing futures engine / ledger model.
 */

import type { TradeFeeRecord } from "@/lib/portfolio/fees/types";
import type {
  OrderStatus,
  RegisteredOrderType,
} from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { MarginMode, TradePositionMode } from "@/lib/portfolio/types";

export type PerpTrade = {
  id: string;
  domain: "PERP";
  walletId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  timestamp: number;
  leverage: number;
  marginMode: MarginMode;
  positionMode: TradePositionMode;
  liquidation?: boolean;
  fees: TradeFeeRecord;
  reduceOnly?: boolean;
  postOnly?: boolean;
  executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
};

export type PerpPosition = {
  symbol: string;
  quantity: number;
  avgEntry: number;
  markPrice: number;
  marginMode: MarginMode;
  leverage: number;
  entryMargin: number;
  maintenanceMargin: number;
  liquidationPrice: number | null;
  positionValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  roiPercent: number;
  marginRatio: number;
  status: "OPEN" | "LIQUIDATED";
};

export type PerpOrder = {
  id: string;
  domain: "PERP";
  walletId: string;
  symbol: string;
  side: "BUY" | "SELL";
  direction: "LONG" | "SHORT";
  orderType: RegisteredOrderType;
  marginMode: MarginMode;
  leverage: number;
  triggerPrice: number;
  quantity: number;
  margin: number;
  /** Format target: `${walletId}:PERP:${symbol}` */
  positionId: string | null;
  limitPrice: number | null;
  reduceOnly: boolean;
  postOnly: boolean;
  executionLiquidity: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  filledAt: number | null;
  rejectedReason: string | null;
};

/**
 * Runtime intent for PERP execution (Phase 2).
 * Maps 1:1 onto the legacy TradeExecutionRequest payload.
 */
export type PerpExecutionIntent = {
  walletId: string | null;
  symbol: string;
  direction: "LONG" | "SHORT";
  orderType: "MARKET" | "LIMIT";
  marginMode: MarginMode;
  leverage: number;
  quantity: number;
  margin: number;
  price: number;
  marketPrice: number;
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  postOnlyEnabled: boolean;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
};
