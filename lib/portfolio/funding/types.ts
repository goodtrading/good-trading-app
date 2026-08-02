export type FundingSchedule = {
  version: string;
  intervalHours: number;
  /** Decimal rate — 0.0001 = 0.010% */
  defaultFundingRate: number;
  currency: string;
};

export type FundingPaymentInput = {
  quantity: number;
  markPrice: number;
  fundingRate: number;
};

export type FundingSettlementInput = {
  quantity: number;
  markPrice: number;
  fundingRate: number;
  symbol: string;
  timestamp: number;
  schedule?: FundingSchedule;
};

export type FundingScheduleInfo = {
  nextFundingTime: number;
  isDue: boolean;
};
