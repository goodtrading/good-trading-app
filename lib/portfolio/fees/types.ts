/** Fee category — Stage 12 will assign rates per type. */
export type FeeType = "MAKER" | "TAKER" | "OPENING" | "CLOSING" | "FUNDING";

/** Fee schedule — single source for maker/taker rates. */
export type FeeSchedule = {
  version: string;
  makerRate: number;
  takerRate: number;
  currency: string;
};

/** @deprecated Use FeeSchedule — kept for backward-compatible exports. */
export type FeePolicy = FeeSchedule & {
  openingRate: number;
  closingRate: number;
  fundingRate: number;
};

/** Single fee line item. */
export type TradeFee = {
  type: FeeType;
  amount: number;
  currency: string;
};

/** Full fee decomposition for one execution. */
export type FeeBreakdown = {
  makerFee: number;
  takerFee: number;
  openingFee: number;
  closingFee: number;
  fundingFee: number;
  totalFee: number;
  currency: string;
  feeModelVersion: string;
};

/** Fee bundle attached to a trade execution. */
export type ExecutionFee = {
  breakdown: FeeBreakdown;
  items: TradeFee[];
};

/** Persisted fee record on each PERP ledger trade. */
export type TradeFeeRecord = {
  openingFee: number;
  closingFee: number;
  fundingFee: number;
  totalFee: number;
  feeCurrency: string;
  feeModelVersion: string;
  breakdown: FeeBreakdown;
};

/** Aggregated fee metrics for wallet / snapshot. */
export type PerpFeeMetrics = {
  feesPaid: number;
  feesToday: number;
  openingFees: number;
  closingFees: number;
  fundingFees: number;
  totalFees: number;
  estimatedOpeningFee: number;
  estimatedClosingFee: number;
  /** Aggregated maker/taker trade counts (snapshot). */
  makerTrades?: number;
  takerTrades?: number;
  makerFees?: number;
  takerFees?: number;
};
