import { BINANCE_USDT_FUTURES_FEE_SCHEDULE } from "@/lib/portfolio/fees/FeeSchedule";

export const TAKER_RATE = BINANCE_USDT_FUTURES_FEE_SCHEDULE.takerRate;
export const MAKER_RATE = BINANCE_USDT_FUTURES_FEE_SCHEDULE.makerRate;

export function takerFee(notional: number): number {
  if (!(notional > 0)) return 0;
  return Number((notional * TAKER_RATE).toFixed(4));
}

export function makerFee(notional: number): number {
  if (!(notional > 0)) return 0;
  return Number((notional * MAKER_RATE).toFixed(4));
}

/** Standard opening fee for qty × price at taker rate. */
export function openFee(quantity: number, price: number): number {
  return takerFee(quantity * price);
}

/** Standard closing fee for qty × price at taker rate. */
export function closeFee(quantity: number, price: number): number {
  return takerFee(quantity * price);
}

/** Zero funding snapshot fields for PerpWalletSnapshot test fixtures. */
export const ZERO_FUNDING_SNAPSHOT = {
  fundingEvents: [] as import("@/lib/portfolio/financial/types").FinancialEvent[],
  fundingRate: 0,
  lastFundingTime: null as number | null,
  nextFundingTime: 0,
  pendingFunding: 0,
};

/** Default reduce-only snapshot fields for PerpWalletSnapshot test fixtures. */
export const ZERO_REDUCE_ONLY_SNAPSHOT = {
  canReduce: false,
  maxReducibleQuantity: 0,
  reduceOnlySupported: true,
};

/** Default post-only snapshot fields for PerpWalletSnapshot test fixtures. */
export const ZERO_POST_ONLY_SNAPSHOT = {
  postOnlySupported: true,
  makerEligible: true,
};

/** Zero maker/taker aggregate fields for PerpWalletSnapshot test fixtures. */
export const ZERO_MAKER_TAKER_SNAPSHOT = {
  makerTrades: 0,
  takerTrades: 0,
  makerFees: 0,
  takerFees: 0,
};

/** Default open-order snapshot fields for PerpWalletSnapshot test fixtures. */
export const ZERO_OPEN_ORDERS_SNAPSHOT = {
  openOcoGroups: [] as import("@/lib/portfolio/oco/OcoGroup").OcoGroupSnapshotEntry[],
  openTrailingStops: [] as import("@/lib/portfolio/trailing/TrailingStop").TrailingStopSnapshotEntry[],
};

/** Default insurance fund snapshot fields (FASE 12.9). */
export const ZERO_INSURANCE_FUND_SNAPSHOT = {
  insuranceFundBalance: 0,
  insuranceFundHistory: [] as import("@/lib/portfolio/insurance/InsuranceFund").InsuranceFundEvent[],
  insuranceFundExposure: 0,
  insuranceFund: {
    balance: 0,
    totalPayouts: 0,
    totalGains: 0,
    netFlow: 0,
    lastUpdated: 0,
    exposure: 0,
  },
  insurancePayouts: 0,
  insuranceGains: 0,
};
