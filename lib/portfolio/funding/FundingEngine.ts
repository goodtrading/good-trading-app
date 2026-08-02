import { DEFAULT_FUNDING_SCHEDULE } from "@/lib/portfolio/funding/FundingSchedule";
import type {
  FundingPaymentInput,
  FundingSchedule,
  FundingScheduleInfo,
  FundingSettlementInput,
} from "@/lib/portfolio/funding/types";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";

export const FUNDING_EVENT_PREFIX = "funding_";

function roundAmount(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Number(value.toFixed(4));
}

export function fundingIntervalMs(schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE): number {
  return schedule.intervalHours * 3_600_000;
}

/** Active funding rate — schedule default until external rates are wired. */
export function computeFundingRate(schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE): number {
  return schedule.defaultFundingRate;
}

/**
 * Signed wallet delta from funding.
 * Positive rate: LONG pays (negative), SHORT receives (positive).
 * Negative rate: SHORT pays, LONG receives.
 */
export function computeFundingPayment(input: FundingPaymentInput): number {
  const { quantity, markPrice, fundingRate } = input;
  if (quantity === 0 || !(markPrice > 0) || fundingRate === 0) {
    return 0;
  }
  const notional = Math.abs(quantity) * markPrice;
  return roundAmount(-Math.sign(quantity) * notional * fundingRate);
}

export function fundingCycleTimestamp(
  timestamp: number,
  schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE,
): number {
  const interval = fundingIntervalMs(schedule);
  return Math.floor(timestamp / interval) * interval;
}

export function nextFundingTimestamp(
  lastFundingTime: number | null,
  now: number,
  schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE,
): number {
  const interval = fundingIntervalMs(schedule);
  if (lastFundingTime != null) {
    return lastFundingTime + interval;
  }
  if (now % interval === 0) {
    return now;
  }
  return Math.ceil(now / interval) * interval;
}

export function isFundingDue(
  lastFundingTime: number | null,
  now: number,
  schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE,
): boolean {
  return now >= nextFundingTimestamp(lastFundingTime, now, schedule);
}

/** Schedule metadata for snapshot / scheduler — injectable `now` for tests. */
export function scheduleFunding(args: {
  lastFundingTime: number | null;
  now: number;
  schedule?: FundingSchedule;
}): FundingScheduleInfo {
  const schedule = args.schedule ?? DEFAULT_FUNDING_SCHEDULE;
  const nextFundingTime = nextFundingTimestamp(args.lastFundingTime, args.now, schedule);
  return {
    nextFundingTime,
    isDue: args.now >= nextFundingTime,
  };
}

export function getLastFundingTime(
  events: FinancialEvent[] | undefined,
): number | null {
  const funding = (events ?? []).filter((e) => e.type === "FUNDING");
  if (funding.length === 0) return null;
  return Math.max(...funding.map((e) => e.timestamp));
}

export function listFundingEvents(events: FinancialEvent[] | undefined): FinancialEvent[] {
  return (events ?? []).filter((e) => e.type === "FUNDING");
}

/** Build a FUNDING FinancialEvent — never a Trade. */
export function settleFunding(input: FundingSettlementInput): FinancialEvent | null {
  const schedule = input.schedule ?? DEFAULT_FUNDING_SCHEDULE;
  const amount = computeFundingPayment({
    quantity: input.quantity,
    markPrice: input.markPrice,
    fundingRate: input.fundingRate,
  });
  if (amount === 0) return null;

  const cycleTs = fundingCycleTimestamp(input.timestamp, schedule);
  const side = input.quantity > 0 ? "LONG" : "SHORT";

  return {
    id: `${FUNDING_EVENT_PREFIX}${input.symbol}_${cycleTs}`,
    timestamp: input.timestamp,
    type: "FUNDING",
    amount,
    currency: schedule.currency,
    symbol: input.symbol,
    description: `Funding ${side} @ ${(input.fundingRate * 100).toFixed(4)}%`,
    version: schedule.version,
    fundingRate: input.fundingRate,
  };
}
