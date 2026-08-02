import { executionRouter } from "@/lib/portfolio/domain/ExecutionRouter";
import { computeLiquidationState } from "@/lib/portfolio/futures/MarginModel";
import { isLiquidationCondition } from "@/lib/portfolio/futures/futuresAccounting";
import { insuranceFundRuntime } from "@/lib/portfolio/insurance/InsuranceFundRuntime";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioEngineState, Position, Trade } from "@/lib/portfolio/types";

export type LiquidationResult = {
  positionId: string;
  side: "LONG" | "SHORT";
  quantity: number;
  avgEntry: number;
  marketPrice: number;
  liquidationPrice: number | null;
  leverage: number;
  marginMode: Position["marginMode"];
  reason: "EQUITY_BREACH";
};

export type LiquidationEngineOptions = {
  walletId?: string | null;
  storage?: PortfolioStorage | null;
};

/** Liquidation display price — delegates to MarginModel (same as risk engine). */
export function computeLiquidationPrice(
  position: Position,
  walletBalance = 0,
): number | null {
  if (position.quantity === 0) return null;
  return computeLiquidationState({
    quantity: position.quantity,
    avgEntry: position.avgEntry,
    entryMargin: position.entryMargin,
    markPrice: position.markPrice,
    leverage: position.leverage,
    marginMode: position.marginMode,
    walletBalance,
  }).liquidationPrice;
}

export class LiquidationEngine {
  private readonly walletId: string | null;
  private readonly storage: PortfolioStorage | null;

  constructor(
    private readonly portfolioEngine: PortfolioEngine,
    options: LiquidationEngineOptions = {},
  ) {
    this.walletId = options.walletId ?? null;
    this.storage = options.storage ?? null;
  }

  evaluate(
    position: Position,
    marketPrice: number,
    portfolioState: PortfolioEngineState,
  ): LiquidationResult | null {
    if (position.quantity === 0 || position.status === "LIQUIDATED") {
      return null;
    }

    const shouldLiquidate = isLiquidationCondition({
      position,
      accountEquity: portfolioState.portfolio.equity,
    });

    if (!shouldLiquidate) {
      return null;
    }

    const side: "LONG" | "SHORT" = position.quantity > 0 ? "LONG" : "SHORT";
    const liquidation = computeLiquidationState({
      quantity: position.quantity,
      avgEntry: position.avgEntry,
      entryMargin: position.entryMargin,
      markPrice: marketPrice,
      leverage: position.leverage,
      marginMode: position.marginMode,
      walletBalance: portfolioState.portfolio.walletBalance,
    });

    const result: LiquidationResult = {
      positionId: position.symbol,
      side,
      quantity: Math.abs(position.quantity),
      avgEntry: position.avgEntry,
      marketPrice,
      liquidationPrice: liquidation.liquidationPrice,
      leverage: position.leverage,
      marginMode: position.marginMode,
      reason: "EQUITY_BREACH",
    };

    console.log("[LIQUIDATION TRIGGERED]", result);
    return result;
  }

  async executeLiquidation(positionId: string): Promise<Trade[]> {
    const marketPrice = this.portfolioEngine.getLastMarketPrice();
    if (marketPrice == null) {
      throw new Error("LiquidationEngine: no market price available");
    }

    console.log("[LIQUIDATION EXECUTE]", { positionId, marketPrice });

    const before = await this.portfolioEngine.getState(marketPrice);
    const beforeIds = new Set(before.trades.map((trade) => trade.id));
    const position =
      before.positions.find((entry) => entry.symbol === positionId && entry.quantity !== 0) ??
      null;

    const liquidationResult = position
      ? this.evaluate(position, marketPrice, before)
      : null;

    const bankruptcyPrice =
      position != null
        ? computeLiquidationState({
            quantity: position.quantity,
            avgEntry: position.avgEntry,
            entryMargin: position.entryMargin,
            markPrice: marketPrice,
            leverage: position.leverage,
            marginMode: position.marginMode,
            walletBalance: before.portfolio.walletBalance,
          }).bankruptcyPrice
        : null;

    await executionRouter.dispatch(this.portfolioEngine, {
      type: "FORCE_LIQUIDATE",
      domain: "PERP",
      walletId: this.walletId,
      symbol: positionId,
      marketPrice,
    });

    const after = await this.portfolioEngine.getState(marketPrice);
    const created = after.trades.filter((trade) => !beforeIds.has(trade.id));

    console.log("[LIQUIDATION FILLED]", {
      positionId,
      tradeCount: created.length,
      tradeIds: created.map((trade) => trade.id),
      liquidated: created.some((trade) => trade.liquidation === true),
    });

    if (
      this.walletId &&
      position != null &&
      liquidationResult != null &&
      created.length > 0
    ) {
      const closingTrade = created.find((trade) => trade.liquidation === true) ?? created[0]!;
      await resolveInsuranceSettlementHook({
        walletId: this.walletId,
        storage: this.storage,
        position,
        liquidationResult,
        closingTrade,
        bankruptcyPrice,
      });
    }

    return created;
  }
}

async function resolveInsuranceSettlementHook(input: {
  walletId: string;
  storage: PortfolioStorage | null;
  position: Position;
  liquidationResult: LiquidationResult;
  closingTrade: Trade;
  bankruptcyPrice: number | null;
}): Promise<void> {
  const settlement = await insuranceFundRuntime.settleLiquidation(
    input.walletId,
    {
      position: input.position,
      liquidationResult: input.liquidationResult,
      closingTrade: input.closingTrade,
      bankruptcyPrice: input.bankruptcyPrice,
    },
    input.storage,
  );

  console.log("[INSURANCE SETTLEMENT]", {
    walletId: input.walletId,
    symbol: input.position.symbol,
    payout: settlement.payout,
    gain: settlement.gain,
    adlResidual: settlement.adlResidual,
    fundBalance: settlement.fundBalance,
    requiresAdl: settlement.requiresAdl,
  });
}

export function createLiquidationEngine(
  portfolioEngine: PortfolioEngine,
  options: LiquidationEngineOptions = {},
): LiquidationEngine {
  return new LiquidationEngine(portfolioEngine, options);
}
