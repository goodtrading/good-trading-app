/**
 * @deprecated Use `@/lib/cartera/read/portfolioReadModelService` and `@/lib/cartera/read/types`.
 *
 * This module previously coupled Portfolio aggregation to PortfolioEngine (write path).
 * Kept for backward compatibility during migration — do not use in new code.
 */
import type { PortfolioAccount } from "@/lib/portfolio/accounts/types";
import { PortfolioReadModelService } from "@/lib/cartera/read/portfolioReadModelService";
import type { PortfolioReadModel, PerformanceMetric, WealthSlice } from "@/lib/cartera/read/types";
import { wealthSliceColor } from "@/lib/cartera/read/types";
import {
  aggregatePositionsBySymbol,
  groupSmallSlices,
  ledgerProjectionToPositions,
} from "@/lib/cartera/read/portfolioReadProjection";
import type {
  PortfolioEngineState,
  PortfolioPosition,
  PortfolioProvider,
} from "@/lib/portfolio/types";

/** @deprecated Use `PortfolioReadModel` from `@/lib/cartera/read/types`. */
export type ConsolidatedWealth = PortfolioReadModel;

export type { WealthSlice, PerformanceMetric };

export { wealthSliceColor, aggregatePositionsBySymbol, groupSmallSlices };

/** @deprecated Use `ledgerProjectionToPositions`. */
export const engineStateToPositions = ledgerProjectionToPositions;

/**
 * @deprecated Portfolio must not load positions via PortfolioEngine.
 * Use `PortfolioReadModelService.load()` instead.
 */
export async function loadPaperAccountPositions(
  _account: PortfolioAccount,
  _marketPrice: number,
): Promise<PortfolioPosition[]> {
  throw new Error(
    "loadPaperAccountPositions is deprecated. Use PortfolioReadModelService.load() — engine path forbidden in Portfolio context.",
  );
}

/**
 * @deprecated Use `PortfolioReadModelService.load(marketPrice)`.
 */
export async function buildConsolidatedWealth(input: {
  paperAccounts: PortfolioAccount[];
  marketPrice: number;
  exchangeConnections: { binance: boolean; bingx: boolean };
  getProvider: (id: "binance" | "bingx") => PortfolioProvider | undefined;
}): Promise<PortfolioReadModel> {
  void input;
  return PortfolioReadModelService.load(input.marketPrice);
}

/** @deprecated Test helper alias. */
export function _engineStateToPositionsForTests(state: PortfolioEngineState): PortfolioPosition[] {
  return ledgerProjectionToPositions(state);
}
