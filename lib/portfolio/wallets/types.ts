import type { SpotBalance } from "@/lib/portfolio/spot/types";

/** Spot wallet — asset balances owned by the paper account. */
export type SpotWalletSnapshot = {
  accountId: string;
  usdtFree: number;
  usdtLocked: number;
  usdtTotal: number;
  balances: SpotBalance[];
};

/** Perp wallet — futures margin wallet (derived from PERP ledger). */
export type PerpWalletSnapshot = {
  accountId: string;
  /** Immutable genesis deposit (historical). */
  initialCashBalance: number;
  /** Mutable PERP cash (transfers adjust this, not genesis). */
  walletCash: number;
  /** walletCash + realizedPnL. */
  walletBalance: number;
  /** USDT available to open margin / transfer out. */
  availableBalance: number;
  equity: number;
  marginUsed: number;
  realizedPnL: number;
  unrealizedPnL: number;
  /** Cumulative persisted fees — deducted from walletBalance. */
  feesPaid: number;
  feesToday: number;
  openingFees: number;
  closingFees: number;
  fundingFees: number;
  totalFees: number;
  estimatedOpeningFee: number;
  estimatedClosingFee: number;
  /** Hydrated financial events (includes legacy TRADE_FEE synthesis). */
  financialEvents: import("@/lib/portfolio/financial/types").FinancialEvent[];
  fundingPaid: number;
  rebates: number;
  insurance: number;
  adl: number;
  manualAdjustments: number;
  /** Persisted FUNDING events only (not hydrated TRADE_FEE). */
  fundingEvents: import("@/lib/portfolio/financial/types").FinancialEvent[];
  fundingRate: number;
  lastFundingTime: number | null;
  nextFundingTime: number;
  pendingFunding: number;
  /** True when an open position exists and can be reduced. */
  canReduce: boolean;
  /** Absolute position size reducible via reduce-only orders. */
  maxReducibleQuantity: number;
  /** PERP supports reduce-only execution constraints. */
  reduceOnlySupported: boolean;
  /** PERP supports post-only LIMIT registration. */
  postOnlySupported: boolean;
  /** True when mark price is available for post-only eligibility checks. */
  makerEligible: boolean;
  makerTrades: number;
  takerTrades: number;
  makerFees: number;
  takerFees: number;
  /** Active OCO TP+SL groups (FASE 12.7). */
  openOcoGroups: import("@/lib/portfolio/oco/OcoGroup").OcoGroupSnapshotEntry[];
  /** Active trailing stops (FASE 12.8). */
  openTrailingStops: import("@/lib/portfolio/trailing/TrailingStop").TrailingStopSnapshotEntry[];
  /** Insurance fund balance (FASE 12.9) — settlement layer, not user equity. */
  insuranceFundBalance: number;
  insuranceFundHistory: import("@/lib/portfolio/insurance/InsuranceFund").InsuranceFundEvent[];
  insuranceFundExposure: number;
  insuranceFund: import("@/lib/portfolio/insurance/InsuranceFundSnapshot").InsuranceFundSnapshot;
  insurancePayouts: number;
  insuranceGains: number;
};
