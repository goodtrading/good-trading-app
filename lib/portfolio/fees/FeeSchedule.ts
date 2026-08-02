import type { FeeSchedule } from "@/lib/portfolio/fees/types";

/** Binance Futures USDT-M standard tier (non-VIP). */
export const BINANCE_USDT_FUTURES_FEE_SCHEDULE: FeeSchedule = {
  version: "binance-usdt-v1",
  makerRate: 0.0002,
  takerRate: 0.0005,
  currency: "USDT",
};

/** Active fee schedule — swap for VIP tiers in future without touching pipeline code. */
export const DEFAULT_FEE_SCHEDULE: FeeSchedule = BINANCE_USDT_FUTURES_FEE_SCHEDULE;
