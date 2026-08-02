export const INSURANCE_FUND_VERSION = "insurance-fund-v1";

export type InsuranceFundEventKind = "PAYOUT" | "GAIN" | "ADL_RESIDUAL";

/** Insurance fund ledger entry — separate from user wallet movements. */
export type InsuranceFundEvent = {
  id: string;
  timestamp: number;
  kind: InsuranceFundEventKind;
  /** Signed delta applied to fund balance (negative = payout, positive = gain). */
  amount: number;
  balanceAfter: number;
  symbol: string;
  positionId?: string;
  tradeId?: string;
  deficit?: number;
  adlResidual?: number;
  description: string;
};

export type InsuranceDailyAggregate = {
  dayStart: number;
  payouts: number;
  gains: number;
  netFlow: number;
};

export type InsuranceFundState = {
  walletId: string;
  balance: number;
  events: InsuranceFundEvent[];
  dailyAggregates: InsuranceDailyAggregate[];
  /** Cumulative ADL residual not yet covered (FASE 12.10 hook). */
  adlExposure: number;
  lastUpdated: number;
  version: string;
};

export function createInsuranceFundEventId(): string {
  return `ins_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyInsuranceFundState(walletId: string): InsuranceFundState {
  return {
    walletId,
    balance: 0,
    events: [],
    dailyAggregates: [],
    adlExposure: 0,
    lastUpdated: Date.now(),
    version: INSURANCE_FUND_VERSION,
  };
}

export function hydrateInsuranceFundState(state: InsuranceFundState): InsuranceFundState {
  return {
    ...createEmptyInsuranceFundState(state.walletId),
    ...state,
    balance: Math.max(0, state.balance ?? 0),
    events: Array.isArray(state.events) ? [...state.events] : [],
    dailyAggregates: Array.isArray(state.dailyAggregates) ? [...state.dailyAggregates] : [],
    adlExposure: Math.max(0, state.adlExposure ?? 0),
    version: INSURANCE_FUND_VERSION,
  };
}
