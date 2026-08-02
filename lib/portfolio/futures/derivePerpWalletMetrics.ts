import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { aggregateTradeFees } from "@/lib/portfolio/fees/aggregateTradeFees";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
import { resolvePositionLeverage, resolvePositionMarginMode } from "@/lib/portfolio/futures/futuresAccounting";
import { FinancialEventLedger } from "@/lib/portfolio/financial/FinancialEventLedger";
import {
  computeFundingPayment,
  computeFundingRate,
  getLastFundingTime,
  listFundingEvents,
  scheduleFunding,
} from "@/lib/portfolio/funding/FundingEngine";
import { DEFAULT_FUNDING_SCHEDULE } from "@/lib/portfolio/funding/FundingSchedule";
import { computeWalletState } from "@/lib/portfolio/futures/MarginModel";
import {
  DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  type PerpAccountPositionMode,
} from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import { signedQuantityForLeg } from "@/lib/portfolio/hedge/resolvePositionSide";
import { aggregateOpenPositionMetrics } from "@/lib/portfolio/position/positionEngineRouter";
import { buildPosition } from "@/lib/portfolio/positionEngine";
import {
  resolveCanReduce,
  resolveMaxReducibleQuantity,
} from "@/lib/portfolio/reduceOnly/ReduceOnlyValidator";
import {
  resolveMakerEligible,
  resolvePostOnlySupported,
} from "@/lib/portfolio/postOnly/PostOnlyValidator";
import type { FinancialEvent } from "@/lib/portfolio/financial/types";
import type { MarginMode, Position, Trade } from "@/lib/portfolio/types";
import type { OcoGroupSnapshotEntry } from "@/lib/portfolio/oco/OcoGroup";
import type { TrailingStopSnapshotEntry } from "@/lib/portfolio/trailing/TrailingStop";
import type { InsuranceFundSnapshot } from "@/lib/portfolio/insurance/InsuranceFundSnapshot";
import type { InsuranceFundEvent } from "@/lib/portfolio/insurance/InsuranceFund";

/** Shared PERP wallet derivation — WalletService, snapshot, engine. */
export function derivePerpWalletMetrics(args: {
  accountId: string;
  initialCashBalance: number;
  walletCash: number;
  realizedPnL: number;
  trades: Trade[];
  financialEvents?: FinancialEvent[];
  markPrice: number;
  leverage?: number;
  marginMode?: MarginMode;
  accountPositionMode?: PerpAccountPositionMode;
  openOcoGroups?: OcoGroupSnapshotEntry[];
  openTrailingStops?: TrailingStopSnapshotEntry[];
  insuranceFund?: InsuranceFundSnapshot;
  insuranceFundHistory?: InsuranceFundEvent[];
  asOfTimestamp?: number;
}): {
  position: Position | null;
  positions: Position[];
  snapshot: PerpWalletSnapshot;
} {
  const financialEvents = args.financialEvents ?? [];
  const asOf = args.asOfTimestamp ?? Date.now();
  const accountPositionMode =
    args.accountPositionMode ?? DEFAULT_PERP_ACCOUNT_POSITION_MODE;
  const walletBalance = resolveWalletBalance(args.walletCash, args.trades, financialEvents);
  const leverage = args.leverage ?? resolvePositionLeverage(args.trades, 1);
  const marginMode = args.marginMode ?? resolvePositionMarginMode(args.trades, "CROSS");
  const defaults = { leverage, marginMode, walletBalance };

  const aggregated =
    args.markPrice > 0
      ? aggregateOpenPositionMetrics(
          args.trades,
          args.markPrice,
          accountPositionMode,
          defaults,
        )
      : {
          positions: [] as Position[],
          unrealizedPnL: 0,
          marginUsed: 0,
          maintenanceMarginTotal: 0,
          realizedPnL: 0,
        };

  const positions = aggregated.positions;
  const unrealizedPnL = aggregated.unrealizedPnL;
  const marginUsed = aggregated.marginUsed;
  const maintenanceMarginTotal = aggregated.maintenanceMarginTotal;

  const position =
    accountPositionMode === "HEDGE"
      ? positions.find((leg) => leg.quantity !== 0) ?? null
      : args.markPrice > 0
        ? buildPosition(args.trades, args.markPrice, PORTFOLIO_V1_SYMBOL, defaults)
        : null;

  const wallet = computeWalletState({
    walletBalance,
    marginUsed,
    unrealizedPnL,
    maintenanceMarginTotal,
    marginMode,
  });

  const feeMetrics = aggregateTradeFees(args.trades, financialEvents, asOf);
  const eventAgg = FinancialEventLedger.hydrate(financialEvents, args.trades).aggregate(asOf);
  const { realizedPnL } = aggregated;
  const hydratedEvents = FinancialEventLedger.hydrate(financialEvents, args.trades).listEvents();
  const persistedFunding = listFundingEvents(financialEvents);
  const lastFundingTime = getLastFundingTime(financialEvents);
  const fundingRate = computeFundingRate(DEFAULT_FUNDING_SCHEDULE);
  const fundingSchedule = scheduleFunding({
    lastFundingTime,
    now: asOf,
    schedule: DEFAULT_FUNDING_SCHEDULE,
  });

  const openLegs = positions.filter((leg) => leg.quantity !== 0);
  const pendingFunding = openLegs.reduce((sum, leg) => {
    const side = leg.side ?? (leg.quantity > 0 ? "LONG" : "SHORT");
    const signedQty = signedQuantityForLeg(side, Math.abs(leg.quantity));
    return (
      sum +
      computeFundingPayment({
        quantity: signedQty,
        markPrice: args.markPrice,
        fundingRate,
      })
    );
  }, 0);

  const maxReducibleQuantity =
    accountPositionMode === "HEDGE"
      ? openLegs.reduce((sum, leg) => sum + Math.abs(leg.quantity), 0)
      : resolveMaxReducibleQuantity(position?.quantity ?? 0);
  const canReduce =
    accountPositionMode === "HEDGE"
      ? maxReducibleQuantity > 0
      : resolveCanReduce(position?.quantity ?? 0);

  return {
    position,
    positions,
    snapshot: {
      accountId: args.accountId,
      initialCashBalance: args.initialCashBalance,
      walletCash: args.walletCash,
      walletBalance: wallet.walletBalance,
      availableBalance: wallet.availableBalance,
      equity: wallet.equity,
      marginUsed: wallet.marginUsed,
      realizedPnL,
      unrealizedPnL: wallet.unrealizedPnL,
      feesPaid: feeMetrics.feesPaid,
      feesToday: feeMetrics.feesToday,
      openingFees: feeMetrics.openingFees,
      closingFees: feeMetrics.closingFees,
      fundingFees: feeMetrics.fundingFees,
      totalFees: feeMetrics.totalFees,
      estimatedOpeningFee: feeMetrics.estimatedOpeningFee,
      estimatedClosingFee: feeMetrics.estimatedClosingFee,
      financialEvents: [...hydratedEvents],
      fundingPaid: eventAgg.fundingPaid,
      rebates: eventAgg.rebates,
      insurance: eventAgg.insurance,
      adl: eventAgg.adl,
      manualAdjustments: eventAgg.manualAdjustments,
      fundingEvents: persistedFunding,
      fundingRate,
      lastFundingTime,
      nextFundingTime: fundingSchedule.nextFundingTime,
      pendingFunding,
      canReduce,
      maxReducibleQuantity,
      reduceOnlySupported: true,
      postOnlySupported: resolvePostOnlySupported(),
      makerEligible: resolveMakerEligible(args.markPrice),
      makerTrades: feeMetrics.makerTrades ?? 0,
      takerTrades: feeMetrics.takerTrades ?? 0,
      makerFees: feeMetrics.makerFees ?? 0,
      takerFees: feeMetrics.takerFees ?? 0,
      openOcoGroups: args.openOcoGroups ?? [],
      openTrailingStops: args.openTrailingStops ?? [],
      insuranceFundBalance: args.insuranceFund?.balance ?? 0,
      insuranceFundHistory: args.insuranceFundHistory ?? [],
      insuranceFundExposure: args.insuranceFund?.exposure ?? 0,
      insuranceFund: args.insuranceFund ?? {
        balance: 0,
        totalPayouts: 0,
        totalGains: 0,
        netFlow: 0,
        lastUpdated: 0,
        exposure: 0,
      },
      insurancePayouts: eventAgg.insurancePayouts,
      insuranceGains: eventAgg.insuranceGains,
    },
  };
}
