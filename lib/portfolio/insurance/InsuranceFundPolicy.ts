import type { MarginMode } from "@/lib/portfolio/types";

export type InsuranceFundPolicy = {
  /** Fraction of notional charged to fund on liquidation without deficit. */
  liquidationPenaltyRate: number;
  /** When true, residual deficit after fund depletion is queued for ADL. */
  adlEnabled: boolean;
};

export const DEFAULT_INSURANCE_FUND_POLICY: InsuranceFundPolicy = {
  liquidationPenaltyRate: 0.0125,
  adlEnabled: true,
};

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Deficit when execution is worse than bankruptcy (fund must absorb).
 * LONG: execution below bankruptcy. SHORT: execution above bankruptcy.
 */
export function computeLiquidationDeficit(input: {
  side: "LONG" | "SHORT";
  quantity: number;
  executionPrice: number;
  bankruptcyPrice: number | null;
}): number {
  const qty = Math.abs(input.quantity);
  if (!(qty > 0) || input.bankruptcyPrice == null) return 0;

  if (input.side === "LONG" && input.executionPrice < input.bankruptcyPrice) {
    return roundMoney(qty * (input.bankruptcyPrice - input.executionPrice));
  }

  if (input.side === "SHORT" && input.executionPrice > input.bankruptcyPrice) {
    return roundMoney(qty * (input.executionPrice - input.bankruptcyPrice));
  }

  return 0;
}

/** Surplus routed to fund when liquidation has no bankruptcy deficit. */
export function computeLiquidationSurplus(input: {
  side: "LONG" | "SHORT";
  quantity: number;
  executionPrice: number;
  entryMargin: number;
  marginMode: MarginMode;
  policy?: InsuranceFundPolicy;
}): number {
  const qty = Math.abs(input.quantity);
  if (!(qty > 0) || !(input.executionPrice > 0)) return 0;

  const policy = input.policy ?? DEFAULT_INSURANCE_FUND_POLICY;
  const notional = qty * input.executionPrice;
  const penalty = roundMoney(notional * policy.liquidationPenaltyRate);
  const marginRemnant =
    input.marginMode === "ISOLATED" ? roundMoney(Math.max(0, input.entryMargin * 0.1)) : 0;

  return roundMoney(penalty + marginRemnant);
}
