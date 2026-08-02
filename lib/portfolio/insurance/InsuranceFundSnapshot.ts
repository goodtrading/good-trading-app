import type { InsuranceFundEvent, InsuranceFundState } from "@/lib/portfolio/insurance/InsuranceFund";

export type InsuranceFundSnapshot = {
  balance: number;
  totalPayouts: number;
  totalGains: number;
  netFlow: number;
  lastUpdated: number;
  /** ADL queue exposure when fund could not cover full deficit. */
  exposure: number;
};

function startOfUtcDayMs(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

export function buildInsuranceFundSnapshot(state: InsuranceFundState): InsuranceFundSnapshot {
  let totalPayouts = 0;
  let totalGains = 0;

  for (const event of state.events) {
    if (event.kind === "PAYOUT") {
      totalPayouts += Math.abs(event.amount);
    } else if (event.kind === "GAIN") {
      totalGains += event.amount;
    }
  }

  return {
    balance: roundMoney(state.balance),
    totalPayouts: roundMoney(totalPayouts),
    totalGains: roundMoney(totalGains),
    netFlow: roundMoney(totalGains - totalPayouts),
    lastUpdated: state.lastUpdated,
    exposure: roundMoney(state.adlExposure),
  };
}

export function computeInsuranceFundDelta24h(
  state: InsuranceFundState,
  now: number = Date.now(),
): number {
  const dayStart = startOfUtcDayMs(now);
  return roundMoney(
    state.events
      .filter((event) => event.timestamp >= dayStart)
      .reduce((sum, event) => sum + event.amount, 0),
  );
}

export function listRecentInsuranceFundHistory(
  state: InsuranceFundState,
  limit: number = 50,
): InsuranceFundEvent[] {
  return [...state.events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
