import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  resolvePositionLeverage,
  resolvePositionMarginMode,
  resolveWalletCash,
} from "@/lib/portfolio/futures/futuresAccounting";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import {
  accumulatePositionFromTrades,
  buildPosition,
} from "@/lib/portfolio/positionEngine";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import type { SpotBalance } from "@/lib/portfolio/spot/types";
import {
  isEffectivelyZero,
  maxPerpExecutableMargin,
  resolveCanonicalCloseQuantity,
  closeQuantityFromPercent,
  normalizeQuantity,
  isHundredPercent,
} from "@/lib/portfolio/sizing/PositionSizing";
import type { Position } from "@/lib/portfolio/types";
import type { PerpWalletSnapshot, SpotWalletSnapshot } from "@/lib/portfolio/wallets/types";
import { computeInsuranceFundDelta24h } from "@/lib/portfolio/insurance/InsuranceFundRuntime";

export type SpotInventoryEntry = {
  symbol: string;
  baseAsset: string;
  quantity: number;
  averageEntry: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
};

export type PerpExposureEntry = {
  symbol: string;
  quantity: number;
  side: "LONG" | "SHORT";
  entryMargin: number;
  marketValue: number;
  unrealizedPnL: number;
};

/** Canonical financial read model — single source of truth for UI. */
export type AccountFinancials = {
  walletBalance: number;
  equity: number;
  availableBalance: number;
  marginUsed: number;
  positionValue: number;
  lockedFunds: number;
  realizedPnL: number;
  unrealizedPnL: number;
  freeBalances: Record<string, number>;
  blockedBalances: Record<string, number>;
  /** PERP fee metrics — aggregated from FinancialEventLedger (FASE 12.1). */
  feesPaid: number;
  feesToday: number;
  openingFees: number;
  closingFees: number;
  fundingFees: number;
  totalFees: number;
  estimatedOpeningFee: number;
  estimatedClosingFee: number;
  financialEvents: import("@/lib/portfolio/financial/types").FinancialEvent[];
  fundingPaid: number;
  rebates: number;
  insurance: number;
  adl: number;
  manualAdjustments: number;
  fundingEvents: import("@/lib/portfolio/financial/types").FinancialEvent[];
  fundingRate: number;
  lastFundingTime: number | null;
  nextFundingTime: number;
  pendingFunding: number;
  /** PERP reduce-only snapshot (PERP only). */
  canReduce?: boolean;
  maxReducibleQuantity?: number;
  reduceOnlySupported?: boolean;
  postOnlySupported?: boolean;
  makerEligible?: boolean;
  makerTrades?: number;
  takerTrades?: number;
  makerFees?: number;
  takerFees?: number;
};

export type AccountSizing = {
  spotUsdtAvailable: number;
  perpAvailable: number;
  maxSpotSellQuantity: (symbol: string) => number;
  maxPerpMargin: (price: number, leverage: number) => number;
  closeQuantity: (symbol: string, percent: number) => number;
  spotPositionQuantity: (symbol: string) => number;
  perpPositionQuantity: (symbol: string, side?: "LONG" | "SHORT") => number;
};

export type PortfolioAccountSnapshot = {
  accountId: string;
  markPrice: number;
  /** Insurance fund balance — PERP settlement layer (FASE 12.9). */
  insuranceFundBalance: number;
  insuranceFundDelta24h: number;
  spot: AccountFinancials & {
    spotInventory: SpotInventoryEntry[];
  };
  perp: (AccountFinancials & { perpExposure: PerpExposureEntry[] }) | null;
  sizing: AccountSizing;
};

function balancesToMaps(balances: SpotBalance[]): {
  free: Record<string, number>;
  blocked: Record<string, number>;
} {
  const free: Record<string, number> = {};
  const blocked: Record<string, number> = {};
  for (const balance of balances) {
    if (balance.free !== 0) free[balance.asset] = balance.free;
    if (balance.locked !== 0) blocked[balance.asset] = balance.locked;
  }
  return { free, blocked };
}

function buildSpotInventory(
  positions: SpotPositionLive[],
): SpotInventoryEntry[] {
  return positions
    .filter((p) => p.status === "OPEN" && !isEffectivelyZero(p.symbol, p.quantity))
    .map((p) => ({
      symbol: p.symbol,
      baseAsset: p.baseAsset,
      quantity: normalizeQuantity(p.symbol, p.quantity),
      averageEntry: p.averageEntry,
      marketPrice: p.marketPrice,
      marketValue: p.marketValue,
      unrealizedPnL: p.unrealizedPnL,
      realizedPnL: p.realizedPnL,
    }));
}

function buildSpotFinancials(
  spotWallet: SpotWalletSnapshot,
  positions: SpotPositionLive[],
): AccountFinancials & { spotInventory: SpotInventoryEntry[] } {
  const spotInventory = buildSpotInventory(positions);
  const { free, blocked } = balancesToMaps(spotWallet.balances);

  const realizedPnL = positions.reduce((sum, p) => sum + p.realizedPnL, 0);
  const unrealizedPnL = spotInventory.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const positionValue = spotInventory.reduce((sum, p) => sum + p.marketValue, 0);

  const cash = spotWallet.usdtTotal;
  const walletBalance = cash + realizedPnL;
  const equity = walletBalance + unrealizedPnL;
  const lockedFunds =
    spotWallet.usdtLocked +
    Object.entries(blocked).reduce((sum, [, amount]) => sum + amount, 0);

  return {
    walletBalance,
    equity,
    availableBalance: spotWallet.usdtFree,
    marginUsed: 0,
    positionValue,
    lockedFunds,
    realizedPnL,
    unrealizedPnL,
    freeBalances: free,
    blockedBalances: blocked,
    feesPaid: 0,
    feesToday: 0,
    openingFees: 0,
    closingFees: 0,
    fundingFees: 0,
    totalFees: 0,
    estimatedOpeningFee: 0,
    estimatedClosingFee: 0,
    financialEvents: [],
    fundingPaid: 0,
    rebates: 0,
    insurance: 0,
    adl: 0,
    manualAdjustments: 0,
    fundingEvents: [],
    fundingRate: 0,
    lastFundingTime: null,
    nextFundingTime: 0,
    pendingFunding: 0,
    spotInventory,
  };
}

function buildPerpExposure(positions: Position[]): PerpExposureEntry[] {
  return positions
    .filter((p) => p.quantity !== 0 && !isEffectivelyZero(p.symbol, Math.abs(p.quantity)))
    .map((p) => {
      const side = p.side ?? (p.quantity > 0 ? "LONG" : "SHORT");
      const qty =
        p.side != null
          ? normalizeQuantity(p.symbol, p.quantity)
          : normalizeQuantity(p.symbol, Math.abs(p.quantity));
      return {
        symbol: p.symbol,
        quantity: qty,
        side,
        entryMargin: p.entryMargin,
        marketValue: qty * (p.markPrice ?? p.avgEntry),
        unrealizedPnL: p.unrealizedPnL,
      };
    });
}

function buildPerpFinancials(
  perpWallet: PerpWalletSnapshot,
  positions: Position[],
): AccountFinancials & { perpExposure: PerpExposureEntry[] } {
  const perpExposure = buildPerpExposure(positions);
  const positionValue = perpExposure.reduce((sum, p) => sum + p.marketValue, 0);

  return {
    walletBalance: perpWallet.walletBalance,
    equity: perpWallet.equity,
    availableBalance: perpWallet.availableBalance,
    marginUsed: perpWallet.marginUsed,
    positionValue,
    lockedFunds: 0,
    realizedPnL: perpWallet.realizedPnL,
    unrealizedPnL: perpWallet.unrealizedPnL,
    freeBalances: { USDT: perpWallet.walletCash },
    blockedBalances: {},
    feesPaid: perpWallet.feesPaid,
    feesToday: perpWallet.feesToday,
    openingFees: perpWallet.openingFees,
    closingFees: perpWallet.closingFees,
    fundingFees: perpWallet.fundingFees,
    totalFees: perpWallet.totalFees,
    estimatedOpeningFee: perpWallet.estimatedOpeningFee,
    estimatedClosingFee: perpWallet.estimatedClosingFee,
    financialEvents: perpWallet.financialEvents,
    fundingPaid: perpWallet.fundingPaid,
    rebates: perpWallet.rebates,
    insurance: perpWallet.insurance,
    adl: perpWallet.adl,
    manualAdjustments: perpWallet.manualAdjustments,
    fundingEvents: perpWallet.fundingEvents,
    fundingRate: perpWallet.fundingRate,
    lastFundingTime: perpWallet.lastFundingTime,
    nextFundingTime: perpWallet.nextFundingTime,
    pendingFunding: perpWallet.pendingFunding,
    canReduce: perpWallet.canReduce,
    maxReducibleQuantity: perpWallet.maxReducibleQuantity,
    reduceOnlySupported: perpWallet.reduceOnlySupported,
    postOnlySupported: perpWallet.postOnlySupported,
    makerEligible: perpWallet.makerEligible,
    makerTrades: perpWallet.makerTrades,
    takerTrades: perpWallet.takerTrades,
    makerFees: perpWallet.makerFees,
    takerFees: perpWallet.takerFees,
    perpExposure,
  };
}

function buildSizing(
  spot: AccountFinancials & { spotInventory: SpotInventoryEntry[] },
  perp: (AccountFinancials & { perpExposure: PerpExposureEntry[] }) | null,
): AccountSizing {
  const spotQtyBySymbol = new Map(
    spot.spotInventory.map((p) => [p.symbol, p.quantity]),
  );
  const perpQtyBySymbolAndSide = new Map(
    (perp?.perpExposure ?? []).map((p) => [`${p.symbol}:${p.side}`, p.quantity]),
  );

  return {
    spotUsdtAvailable: spot.availableBalance,
    perpAvailable: perp?.availableBalance ?? 0,
    spotPositionQuantity: (symbol) => spotQtyBySymbol.get(symbol) ?? 0,
    perpPositionQuantity: (symbol, side?) => {
      if (side) {
        return perpQtyBySymbolAndSide.get(`${symbol}:${side}`) ?? 0;
      }
      return (perp?.perpExposure ?? [])
        .filter((p) => p.symbol === symbol)
        .reduce((sum, p) => sum + p.quantity, 0);
    },
    maxSpotSellQuantity: (symbol) => {
      const qty = spotQtyBySymbol.get(symbol) ?? 0;
      return resolveCanonicalCloseQuantity({ symbol, quantity: qty });
    },
    maxPerpMargin: (price, leverage) =>
      maxPerpExecutableMargin({
        availableBalance: perp?.availableBalance ?? 0,
        price,
        leverage,
        symbol: PORTFOLIO_V1_SYMBOL,
      }),
    closeQuantity: (symbol, percent) => {
      const spotQty = spotQtyBySymbol.get(symbol) ?? 0;
      const perpQty =
        (perp?.perpExposure ?? [])
          .filter((p) => p.symbol === symbol)
          .reduce((sum, p) => sum + p.quantity, 0) ?? 0;
      const qty = spotQty > 0 ? spotQty : perpQty;
      if (isHundredPercent(percent)) {
        return resolveCanonicalCloseQuantity({ symbol, quantity: qty });
      }
      return closeQuantityFromPercent(symbol, qty, percent);
    },
  };
}

export function buildPortfolioAccountSnapshot(args: {
  accountId: string;
  markPrice: number;
  spotWallet: SpotWalletSnapshot;
  spotPositions: SpotPositionLive[];
  perpWallet: PerpWalletSnapshot | null;
  perpPositions: Position[];
}): PortfolioAccountSnapshot {
  const spot = buildSpotFinancials(args.spotWallet, args.spotPositions);
  const perp = args.perpWallet
    ? buildPerpFinancials(args.perpWallet, args.perpPositions)
    : null;

  const insuranceFund = args.perpWallet?.insuranceFund ?? {
    balance: args.perpWallet?.insuranceFundBalance ?? 0,
    totalPayouts: args.perpWallet?.insurancePayouts ?? 0,
    totalGains: args.perpWallet?.insuranceGains ?? 0,
    netFlow: 0,
    lastUpdated: 0,
    exposure: args.perpWallet?.insuranceFundExposure ?? 0,
  };

  return {
    accountId: args.accountId,
    markPrice: args.markPrice,
    insuranceFundBalance: insuranceFund.balance,
    insuranceFundDelta24h:
      args.perpWallet != null
        ? computeInsuranceFundDelta24h({
            walletId: args.accountId,
            balance: insuranceFund.balance,
            events: args.perpWallet.insuranceFundHistory ?? [],
            dailyAggregates: [],
            adlExposure: insuranceFund.exposure,
            lastUpdated: insuranceFund.lastUpdated,
            version: "insurance-fund-v1",
          })
        : 0,
    spot,
    perp,
    sizing: buildSizing(spot, perp),
  };
}

/** Active-domain financials for header / trade entry. */
export function financialsForMode(
  snapshot: PortfolioAccountSnapshot,
  mode: "SPOT" | "PERP",
): AccountFinancials {
  return mode === "SPOT" ? snapshot.spot : snapshot.perp ?? emptyPerpFinancials();
}

function emptyPerpFinancials(): AccountFinancials {
  return {
    walletBalance: 0,
    equity: 0,
    availableBalance: 0,
    marginUsed: 0,
    positionValue: 0,
    lockedFunds: 0,
    realizedPnL: 0,
    unrealizedPnL: 0,
    freeBalances: {},
    blockedBalances: {},
    feesPaid: 0,
    feesToday: 0,
    openingFees: 0,
    closingFees: 0,
    fundingFees: 0,
    totalFees: 0,
    estimatedOpeningFee: 0,
    estimatedClosingFee: 0,
  };
}

/** Build PERP positions from persisted trades (read-only, no engine). */
export function buildPerpPositionsFromTrades(
  trades: import("@/lib/portfolio/types").Trade[],
  markPrice: number,
): Position[] {
  if (!(markPrice > 0) || trades.length === 0) return [];
  const leverage = resolvePositionLeverage(trades, 1);
  const marginMode = resolvePositionMarginMode(trades, "CROSS");
  const position = buildPosition(trades, markPrice, PORTFOLIO_V1_SYMBOL, {
    leverage,
    marginMode,
  });
  if (!position || position.quantity === 0) return [];
  if (isEffectivelyZero(position.symbol, Math.abs(position.quantity))) return [];
  return [position];
}

/** Inline PERP wallet metrics when only persisted ledger is available. */
export function buildPerpWalletInline(
  accountId: string,
  persisted: {
    initialCashBalance: number;
    walletCash?: number;
    trades: import("@/lib/portfolio/types").Trade[];
    financialEvents?: import("@/lib/portfolio/financial/types").FinancialEvent[];
  },
  markPrice: number,
): PerpWalletSnapshot {
  const walletCash = resolveWalletCash(persisted);
  const { realizedPnL } = accumulatePositionFromTrades(persisted.trades);

  return derivePerpWalletMetrics({
    accountId,
    initialCashBalance: persisted.initialCashBalance,
    walletCash,
    realizedPnL,
    trades: persisted.trades,
    financialEvents: persisted.financialEvents,
    markPrice,
  }).snapshot;
}
