import { hydrateTradeFees } from "@/lib/portfolio/fees/hydrateTradeFees";
import { createTradeFeeEvent } from "@/lib/portfolio/financial/tradeFeeToEvent";
import type {
  FinancialEvent,
  FinancialEventAggregate,
  FinancialEventType,
} from "@/lib/portfolio/financial/types";
import type { Trade } from "@/lib/portfolio/types";

export const FINANCIAL_EVENT_LEDGER_VERSION = "financial-event-v1";

function startOfUtcDayMs(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

function sumTypeAmount(events: FinancialEvent[], type: FinancialEventType): number {
  return roundMoney(
    events.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0),
  );
}

function sumInsuranceEvents(events: FinancialEvent[]): number {
  return roundMoney(
    events
      .filter((e) =>
        e.type === "INSURANCE" ||
        e.type === "INSURANCE_PAYOUT" ||
        e.type === "INSURANCE_GAIN",
      )
      .reduce((sum, e) => sum + Math.abs(e.amount), 0),
  );
}

/** Settlement-layer events — do not affect user wallet balance. */
const SETTLEMENT_ONLY_EVENT_TYPES = new Set<FinancialEventType>([
  "INSURANCE",
  "INSURANCE_PAYOUT",
  "INSURANCE_GAIN",
  "ADL",
]);

export function isSettlementOnlyFinancialEvent(type: FinancialEventType): boolean {
  return SETTLEMENT_ONLY_EVENT_TYPES.has(type);
}

function sumTypeAbs(events: FinancialEvent[], type: FinancialEventType): number {
  return roundMoney(
    events.filter((e) => e.type === type).reduce((sum, e) => sum + Math.abs(e.amount), 0),
  );
}

/** Merge persisted events with synthetic TRADE_FEE events from legacy trades. */
export function hydrateFinancialEvents(
  events: FinancialEvent[],
  trades: Trade[],
): FinancialEvent[] {
  const hydrated = [...events];
  const coveredTradeIds = new Set(
    events
      .filter((e) => e.type === "TRADE_FEE" && e.tradeId)
      .map((e) => e.tradeId!),
  );

  for (const raw of trades) {
    const trade = hydrateTradeFees(raw);
    if (coveredTradeIds.has(trade.id)) continue;
    const event = createTradeFeeEvent(trade);
    if (event) {
      hydrated.push(event);
      coveredTradeIds.add(trade.id);
    }
  }

  return hydrated.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function aggregateFinancialEvents(
  events: FinancialEvent[],
  asOfTimestamp: number = Date.now(),
): FinancialEventAggregate {
  const dayStart = startOfUtcDayMs(asOfTimestamp);

  let netEffect = 0;
  let feesPaid = 0;
  let feesToday = 0;
  let openingFees = 0;
  let closingFees = 0;
  let makerTrades = 0;
  let takerTrades = 0;
  let makerFees = 0;
  let takerFees = 0;

  for (const event of events) {
    const feeAbs = Math.abs(event.amount);

    if (event.type === "TRADE_FEE") {
      feesPaid += feeAbs;
      openingFees += event.openingFee ?? 0;
      closingFees += event.closingFee ?? 0;
      if (event.timestamp >= dayStart) {
        feesToday += feeAbs;
      }

      const liquidity = event.executionLiquidity ?? "UNKNOWN";
      if (liquidity === "MAKER") {
        makerTrades += 1;
        makerFees += event.makerFeeAmount ?? feeAbs;
      } else {
        takerTrades += 1;
        takerFees += event.takerFeeAmount ?? feeAbs;
      }
    }

    if (!isSettlementOnlyFinancialEvent(event.type)) {
      netEffect += event.amount;
    }
  }

  return {
    netEffect: roundMoney(netEffect),
    feesPaid: roundMoney(feesPaid),
    feesToday: roundMoney(feesToday),
    openingFees: roundMoney(openingFees),
    closingFees: roundMoney(closingFees),
    fundingPaid: sumTypeAmount(events, "FUNDING"),
    rebates: sumTypeAmount(events, "MAKER_REBATE"),
    insurance: sumInsuranceEvents(events),
    insurancePayouts: roundMoney(
      sumTypeAbs(events, "INSURANCE_PAYOUT") + sumTypeAbs(events, "INSURANCE"),
    ),
    insuranceGains: sumTypeAbs(events, "INSURANCE_GAIN"),
    adl: sumTypeAmount(events, "ADL"),
    manualAdjustments: sumTypeAmount(events, "MANUAL_ADJUSTMENT"),
    transfers: sumTypeAmount(events, "TRANSFER"),
    makerTrades,
    takerTrades,
    makerFees: roundMoney(makerFees),
    takerFees: roundMoney(takerFees),
  };
}

/**
 * Append-only financial event ledger — single source of truth for non-position wallet movements.
 */
export class FinancialEventLedger {
  private events: FinancialEvent[];

  private constructor(events: FinancialEvent[]) {
    this.events = [...events];
  }

  static fromPersisted(events: FinancialEvent[] | undefined): FinancialEventLedger {
    return new FinancialEventLedger(events ?? []);
  }

  /** Hydrate legacy trades missing TRADE_FEE events without mutating persisted storage. */
  static hydrate(
    events: FinancialEvent[] | undefined,
    trades: Trade[],
  ): FinancialEventLedger {
    return new FinancialEventLedger(hydrateFinancialEvents(events ?? [], trades));
  }

  appendEvent(event: FinancialEvent): void {
    if (this.events.some((e) => e.id === event.id)) {
      throw new Error(`Duplicate financial event id: ${event.id}`);
    }
    if (
      event.type === "TRADE_FEE" &&
      event.tradeId &&
      this.events.some((e) => e.type === "TRADE_FEE" && e.tradeId === event.tradeId)
    ) {
      throw new Error(`Duplicate TRADE_FEE for trade: ${event.tradeId}`);
    }
    this.events.push(event);
  }

  listEvents(): readonly FinancialEvent[] {
    return this.events;
  }

  aggregate(asOfTimestamp: number = Date.now()): FinancialEventAggregate {
    return aggregateFinancialEvents(this.events, asOfTimestamp);
  }

  /** Snapshot for persistence — only explicitly appended events, not hydrated synthetics. */
  persist(): FinancialEvent[] {
    return [...this.events];
  }

  /** Full view including legacy hydration — for wallet derivation. */
  hydratedView(trades: Trade[]): FinancialEventLedger {
    return FinancialEventLedger.hydrate(this.events, trades);
  }
}
