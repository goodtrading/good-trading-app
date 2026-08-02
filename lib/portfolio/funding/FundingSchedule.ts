import type { FundingSchedule } from "@/lib/portfolio/funding/types";

/** Binance USDT-M standard funding interval and default rate. */
export const BINANCE_USDT_FUNDING_SCHEDULE: FundingSchedule = {
  version: "binance-funding-v1",
  intervalHours: 8,
  defaultFundingRate: 0.0001,
  currency: "USDT",
};

export const DEFAULT_FUNDING_SCHEDULE: FundingSchedule = BINANCE_USDT_FUNDING_SCHEDULE;
