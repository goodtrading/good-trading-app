import { FINANCIAL_EVENT_LEDGER_VERSION } from "@/lib/portfolio/financial/FinancialEventLedger";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import {
  createInsuranceFundEventId,
  type InsuranceFundEvent,
  type InsuranceFundState,
} from "@/lib/portfolio/insurance/InsuranceFund";
import { createInsuranceFundLedger } from "@/lib/portfolio/insurance/InsuranceFundLedger";
import {
  computeLiquidationDeficit,
  computeLiquidationSurplus,
  DEFAULT_INSURANCE_FUND_POLICY,
  type InsuranceFundPolicy,
} from "@/lib/portfolio/insurance/InsuranceFundPolicy";
import { buildInsuranceFundSnapshot } from "@/lib/portfolio/insurance/InsuranceFundSnapshot";
import type { LiquidationResult } from "@/lib/portfolio/risk/LiquidationEngine";
import type { MarginMode, Position, Trade } from "@/lib/portfolio/types";

export type LiquidationInsuranceInput = {
  walletId: string;
  position: Position;
  liquidationResult: LiquidationResult;
  closingTrade: Trade;
  bankruptcyPrice: number | null;
  timestamp?: number;
  policy?: InsuranceFundPolicy;
};

export type InsuranceSettlementResult = {
  payout: number;
  gain: number;
  adlResidual: number;
  fundBalance: number;
  requiresAdl: boolean;
  financialEvents: FinancialEvent[];
  fundEvents: InsuranceFundEvent[];
  snapshot: ReturnType<typeof buildInsuranceFundSnapshot>;
  nextState: InsuranceFundState;
};

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

export function createInsurancePayoutFinancialEvent(input: {
  amount: number;
  symbol: string;
  tradeId?: string;
  positionId?: string;
  timestamp: number;
  deficit: number;
}): FinancialEvent {
  return {
    id: createInsuranceFundEventId(),
    timestamp: input.timestamp,
    type: "INSURANCE_PAYOUT",
    amount: -Math.abs(input.amount),
    currency: "USDT",
    symbol: input.symbol,
    tradeId: input.tradeId,
    positionId: input.positionId,
    description: `Insurance fund payout for liquidation deficit (${input.deficit})`,
    version: FINANCIAL_EVENT_LEDGER_VERSION,
  };
}

export function createInsuranceGainFinancialEvent(input: {
  amount: number;
  symbol: string;
  tradeId?: string;
  positionId?: string;
  timestamp: number;
}): FinancialEvent {
  return {
    id: createInsuranceFundEventId(),
    timestamp: input.timestamp,
    type: "INSURANCE_GAIN",
    amount: Math.abs(input.amount),
    currency: "USDT",
    symbol: input.symbol,
    tradeId: input.tradeId,
    positionId: input.positionId,
    description: "Insurance fund gain from liquidation surplus",
    version: FINANCIAL_EVENT_LEDGER_VERSION,
  };
}

export function createAdlResidualFinancialEvent(input: {
  amount: number;
  symbol: string;
  tradeId?: string;
  positionId?: string;
  timestamp: number;
}): FinancialEvent {
  return {
    id: createInsuranceFundEventId(),
    timestamp: input.timestamp,
    type: "ADL",
    amount: -Math.abs(input.amount),
    currency: "USDT",
    symbol: input.symbol,
    tradeId: input.tradeId,
    positionId: input.positionId,
    description: "ADL residual after insurance fund depletion",
    version: FINANCIAL_EVENT_LEDGER_VERSION,
  };
}

/**
 * Resolves insurance fund settlement after a liquidation fill.
 * Does not mutate user margin, position engine, or wallet cash directly.
 */
export function resolveInsuranceSettlement(
  state: InsuranceFundState,
  input: LiquidationInsuranceInput,
): InsuranceSettlementResult {
  const policy = input.policy ?? DEFAULT_INSURANCE_FUND_POLICY;
  const timestamp = input.timestamp ?? input.closingTrade.timestamp ?? Date.now();
  const side = input.liquidationResult.side;
  const quantity = input.liquidationResult.quantity;
  const executionPrice = input.closingTrade.price;
  const symbol = input.position.symbol;
  const tradeId = input.closingTrade.id;
  const positionId = input.liquidationResult.positionId;

  const deficit = computeLiquidationDeficit({
    side,
    quantity,
    executionPrice,
    bankruptcyPrice: input.bankruptcyPrice,
  });

  const ledger = createInsuranceFundLedger(state);
  const financialEvents: FinancialEvent[] = [];
  const fundEvents: InsuranceFundEvent[] = [];

  let payout = 0;
  let gain = 0;
  let adlResidual = 0;

  if (deficit > 0) {
    const covered = roundMoney(Math.min(deficit, ledger.getBalance()));
    adlResidual = roundMoney(deficit - covered);

    if (covered > 0) {
      const fundEvent = ledger.applyPayout({
        amount: covered,
        symbol,
        tradeId,
        positionId,
        deficit,
        adlResidual,
        timestamp,
        description: `Insurance payout for ${side} liquidation deficit`,
      });
      fundEvents.push(fundEvent);
      payout = covered;
      financialEvents.push(
        createInsurancePayoutFinancialEvent({
          amount: covered,
          symbol,
          tradeId,
          positionId,
          timestamp,
          deficit,
        }),
      );
    }

    if (adlResidual > 0 && policy.adlEnabled) {
      const adlEvent = ledger.recordAdlResidual({
        amount: adlResidual,
        symbol,
        tradeId,
        positionId,
        timestamp,
        description: `ADL queue residual after insurance depletion (${adlResidual})`,
      });
      if (adlEvent) {
        fundEvents.push(adlEvent);
      }
      financialEvents.push(
        createAdlResidualFinancialEvent({
          amount: adlResidual,
          symbol,
          tradeId,
          positionId,
          timestamp,
        }),
      );
    }
  } else {
    const surplus = computeLiquidationSurplus({
      side,
      quantity,
      executionPrice,
      entryMargin: input.position.entryMargin,
      marginMode: input.position.marginMode as MarginMode,
      policy,
    });

    if (surplus > 0) {
      const fundEvent = ledger.applyGain({
        amount: surplus,
        symbol,
        tradeId,
        positionId,
        timestamp,
        description: `Insurance gain from ${side} liquidation surplus`,
      });
      fundEvents.push(fundEvent);
      gain = surplus;
      financialEvents.push(
        createInsuranceGainFinancialEvent({
          amount: surplus,
          symbol,
          tradeId,
          positionId,
          timestamp,
        }),
      );
    }
  }

  const nextState = ledger.getState();
  const snapshot = buildInsuranceFundSnapshot(nextState);

  return {
    payout,
    gain,
    adlResidual,
    fundBalance: nextState.balance,
    requiresAdl: adlResidual > 0,
    financialEvents,
    fundEvents,
    snapshot,
    nextState,
  };
}
