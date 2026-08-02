export type FinancialEventType =
  | "TRADE_FEE"
  | "FUNDING"
  | "MAKER_REBATE"
  | "INSURANCE"
  | "INSURANCE_PAYOUT"
  | "INSURANCE_GAIN"
  | "ADL"
  | "MANUAL_ADJUSTMENT"
  | "TRANSFER";

/** Signed cash delta — negative = outflow, positive = inflow. */
export type FinancialEvent = {
  id: string;
  timestamp: number;
  type: FinancialEventType;
  amount: number;
  currency: string;
  symbol?: string;
  positionId?: string;
  tradeId?: string;
  description: string;
  version: string;
  /** TRADE_FEE breakdown — persisted for aggregation without re-reading trades. */
  openingFee?: number;
  closingFee?: number;
  fundingFee?: number;
  executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
  makerFeeAmount?: number;
  takerFeeAmount?: number;
  /** FUNDING rate applied for this event (decimal). */
  fundingRate?: number;
};

export type FinancialEventAggregate = {
  /** Σ(amount) — net wallet effect from all events. */
  netEffect: number;
  feesPaid: number;
  feesToday: number;
  openingFees: number;
  closingFees: number;
  fundingPaid: number;
  rebates: number;
  insurance: number;
  insurancePayouts: number;
  insuranceGains: number;
  adl: number;
  manualAdjustments: number;
  transfers: number;
  makerTrades: number;
  takerTrades: number;
  makerFees: number;
  takerFees: number;
};

export type FinancialHistoryRow = {
  id: string;
  timestamp: number;
  type: FinancialEventType;
  amount: number;
  currency: string;
  symbol?: string;
  tradeId?: string;
  description: string;
};
