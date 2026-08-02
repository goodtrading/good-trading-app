import {
  createInsuranceFundEventId,
  type InsuranceDailyAggregate,
  type InsuranceFundEvent,
  type InsuranceFundState,
} from "@/lib/portfolio/insurance/InsuranceFund";

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

function startOfUtcDayMs(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function upsertDailyAggregate(
  aggregates: InsuranceDailyAggregate[],
  event: InsuranceFundEvent,
): InsuranceDailyAggregate[] {
  const dayStart = startOfUtcDayMs(event.timestamp);
  const next = [...aggregates];
  const index = next.findIndex((entry) => entry.dayStart === dayStart);

  if (index < 0) {
    next.push({
      dayStart,
      payouts: event.kind === "PAYOUT" ? Math.abs(event.amount) : 0,
      gains: event.kind === "GAIN" ? event.amount : 0,
      netFlow: event.amount,
    });
    return next;
  }

  const current = next[index]!;
  next[index] = {
    dayStart,
    payouts: roundMoney(current.payouts + (event.kind === "PAYOUT" ? Math.abs(event.amount) : 0)),
    gains: roundMoney(current.gains + (event.kind === "GAIN" ? event.amount : 0)),
    netFlow: roundMoney(current.netFlow + event.amount),
  };
  return next;
}

/** In-memory insurance fund ledger — balance never goes negative. */
export class InsuranceFundLedger {
  constructor(private state: InsuranceFundState) {}

  getState(): InsuranceFundState {
    return this.state;
  }

  getBalance(): number {
    return this.state.balance;
  }

  applyPayout(input: {
    amount: number;
    symbol: string;
    tradeId?: string;
    positionId?: string;
    deficit: number;
    adlResidual: number;
    timestamp: number;
    description: string;
  }): InsuranceFundEvent {
    const payout = roundMoney(Math.min(input.amount, this.state.balance));
    const nextBalance = roundMoney(Math.max(0, this.state.balance - payout));

    const event: InsuranceFundEvent = {
      id: createInsuranceFundEventId(),
      timestamp: input.timestamp,
      kind: "PAYOUT",
      amount: -payout,
      balanceAfter: nextBalance,
      symbol: input.symbol,
      tradeId: input.tradeId,
      positionId: input.positionId,
      deficit: input.deficit,
      adlResidual: input.adlResidual,
      description: input.description,
    };

    this.state = {
      ...this.state,
      balance: nextBalance,
      adlExposure: roundMoney(this.state.adlExposure + input.adlResidual),
      events: [...this.state.events, event],
      dailyAggregates: upsertDailyAggregate(this.state.dailyAggregates, event),
      lastUpdated: input.timestamp,
    };

    return event;
  }

  applyGain(input: {
    amount: number;
    symbol: string;
    tradeId?: string;
    positionId?: string;
    timestamp: number;
    description: string;
  }): InsuranceFundEvent {
    const gain = roundMoney(Math.max(0, input.amount));
    const nextBalance = roundMoney(this.state.balance + gain);

    const event: InsuranceFundEvent = {
      id: createInsuranceFundEventId(),
      timestamp: input.timestamp,
      kind: "GAIN",
      amount: gain,
      balanceAfter: nextBalance,
      symbol: input.symbol,
      tradeId: input.tradeId,
      positionId: input.positionId,
      description: input.description,
    };

    this.state = {
      ...this.state,
      balance: nextBalance,
      events: [...this.state.events, event],
      dailyAggregates: upsertDailyAggregate(this.state.dailyAggregates, event),
      lastUpdated: input.timestamp,
    };

    return event;
  }

  recordAdlResidual(input: {
    amount: number;
    symbol: string;
    tradeId?: string;
    positionId?: string;
    timestamp: number;
    description: string;
  }): InsuranceFundEvent | null {
    const residual = roundMoney(Math.max(0, input.amount));
    if (residual <= 0) return null;

    const event: InsuranceFundEvent = {
      id: createInsuranceFundEventId(),
      timestamp: input.timestamp,
      kind: "ADL_RESIDUAL",
      amount: 0,
      balanceAfter: this.state.balance,
      symbol: input.symbol,
      tradeId: input.tradeId,
      positionId: input.positionId,
      adlResidual: residual,
      description: input.description,
    };

    this.state = {
      ...this.state,
      adlExposure: roundMoney(this.state.adlExposure + residual),
      events: [...this.state.events, event],
      lastUpdated: input.timestamp,
    };

    return event;
  }
}

export function createInsuranceFundLedger(state: InsuranceFundState): InsuranceFundLedger {
  return new InsuranceFundLedger(state);
}
