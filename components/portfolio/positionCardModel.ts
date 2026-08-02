import type { SpotBalance, SpotTrade } from "@/lib/portfolio/spot/types";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import { perpMetricsAtMark } from "@/lib/portfolio/futures/futuresAccounting";
import { computeLiquidationState, computePositionMarginRatio } from "@/lib/portfolio/futures/MarginModel";
import type { MarginMode, Position } from "@/lib/portfolio/types";

/** Shared presentation model — financial data already computed by each domain. */
export type PositionCardViewModel = {
  domain: "SPOT" | "PERP";
  id: string;
  symbol: string;
  sideLabel: string;
  sideIsLong: boolean;
  quantity: number;
  quantityAsset: string;
  positionValue: number;
  avgEntry: number;
  markPrice: number;
  unrealizedPnL: number;
  pnlPercent: number;
  /** PERP-only presentation fields */
  /** PERP-only — position margin ratio at last engine rebuild. */
  positionMarginRatio?: number;
  marginMode?: MarginMode;
  walletBalance?: number;
  liquidationPrice?: number | null;
  /** @deprecated Use positionMarginRatio */
  marginRatio?: number;
  /** PERP ROI denominator for live tick PnL %. */
  entryMargin?: number;
  marginModeLabel?: string;
  leverage?: number;
};

export function spotPositionToCardView(position: SpotPositionLive): PositionCardViewModel {
  return {
    domain: "SPOT",
    id: position.id,
    symbol: position.symbol,
    sideLabel: "LONG",
    sideIsLong: true,
    quantity: position.quantity,
    quantityAsset: position.baseAsset,
    positionValue: position.marketValue,
    avgEntry: position.averageEntry,
    markPrice: position.marketPrice,
    unrealizedPnL: position.unrealizedPnL,
    pnlPercent: position.unrealizedPnLPercent,
  };
}

export function perpPositionToCardView(
  position: Position,
  walletBalance = 0,
): PositionCardViewModel {
  const isLong = position.quantity >= 0;
  return {
    domain: "PERP",
    id: position.symbol,
    symbol: position.symbol,
    sideLabel: isLong ? "LONG" : "SHORT",
    sideIsLong: isLong,
    quantity: Math.abs(position.quantity),
    quantityAsset: position.symbol.replace("USDT", ""),
    positionValue: position.positionValue,
    avgEntry: position.avgEntry,
    markPrice: position.markPrice,
    unrealizedPnL: position.unrealizedPnL,
    pnlPercent: position.roiPercent,
    marginModeLabel: position.marginMode === "ISOLATED" ? "Isolated" : "Cross",
    marginMode: position.marginMode,
    walletBalance,
    leverage: position.leverage,
    positionMarginRatio: position.marginRatio,
    marginRatio: position.marginRatio,
    liquidationPrice: position.liquidationPrice,
    entryMargin: position.entryMargin,
  };
}

export type LivePositionMetrics = {
  markPrice: number;
  positionValue: number;
  unrealizedPnL: number;
  pnlPercent: number;
  positionMarginRatio?: number;
  liquidationPrice?: number | null;
};

/** Presentation-only live mark/PnL — perpMetricsAtMark + computeLiquidationState. */
export function computeLivePositionMetrics(
  view: Pick<
    PositionCardViewModel,
    | "domain"
    | "quantity"
    | "avgEntry"
    | "sideIsLong"
    | "entryMargin"
    | "leverage"
    | "marginMode"
    | "walletBalance"
  >,
  mark: number,
): LivePositionMetrics {
  if (!(mark > 0)) {
    return { markPrice: 0, positionValue: 0, unrealizedPnL: 0, pnlPercent: 0 };
  }

  const qty = view.quantity;
  const signedQty = view.sideIsLong ? qty : -qty;

  if (view.domain === "PERP" && view.entryMargin != null && view.leverage != null) {
    const metrics = perpMetricsAtMark({
      quantity: signedQty,
      avgEntry: view.avgEntry,
      leverage: view.leverage,
      entryMargin: view.entryMargin,
      markPrice: mark,
    });
    const liquidation = computeLiquidationState({
      quantity: signedQty,
      avgEntry: view.avgEntry,
      entryMargin: view.entryMargin,
      markPrice: mark,
      leverage: view.leverage,
      marginMode: view.marginMode ?? "CROSS",
      walletBalance: view.walletBalance ?? 0,
    });
    return {
      markPrice: mark,
      positionValue: metrics.positionValue,
      unrealizedPnL: metrics.unrealizedPnL,
      pnlPercent: metrics.roiPercent,
      positionMarginRatio: computePositionMarginRatio({
        maintenanceMargin: metrics.maintenanceMargin,
        entryMargin: view.entryMargin,
        unrealizedPnL: metrics.unrealizedPnL,
      }),
      liquidationPrice: liquidation.liquidationPrice,
    };
  }

  const positionValue = qty * mark;
  const costBasis = qty * view.avgEntry;
  const unrealizedPnL = view.sideIsLong
    ? (mark - view.avgEntry) * qty
    : (view.avgEntry - mark) * qty;

  let pnlPercent = 0;
  if (costBasis > 0) {
    pnlPercent = (unrealizedPnL / costBasis) * 100;
  }

  return {
    markPrice: mark,
    positionValue,
    unrealizedPnL,
    pnlPercent: Number(pnlPercent.toFixed(2)),
  };
}

export type SpotMarkPrices = {
  btc: number;
  eth: number;
};

/**
 * Builds SPOT cards without live marks — OpenPositionCard subscribes for PnL/price.
 */
export function buildSpotPositionCards(
  balances: SpotBalance[],
  trades: SpotTrade[],
): PositionCardViewModel[] {
  return balances
    .filter((b) => b.asset !== "USDT" && b.total > 0)
    .map((balance) => {
      const quantity = balance.total;
      const avgEntry = averageBuyPrice(trades, balance.asset);

      return {
        domain: "SPOT" as const,
        id: balance.asset,
        symbol: `${balance.asset}USDT`,
        sideLabel: "LONG",
        sideIsLong: true,
        quantity,
        quantityAsset: balance.asset,
        positionValue: 0,
        avgEntry,
        markPrice: 0,
        unrealizedPnL: 0,
        pnlPercent: 0,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** @deprecated Marks supplied by MarketTickStore subscribers — use buildSpotPositionCards. */
export function buildSpotPositionCardsWithMarks(
  balances: SpotBalance[],
  trades: SpotTrade[],
  marks: SpotMarkPrices,
): PositionCardViewModel[] {
  return buildSpotPositionCards(balances, trades).map((card) => {
    const markPrice = markForAsset(card.quantityAsset, marks);
    const positionValue = card.quantity * markPrice;
    const costBasis = card.quantity * card.avgEntry;
    const unrealizedPnL = positionValue - costBasis;
    const pnlPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
    return {
      ...card,
      markPrice,
      positionValue,
      unrealizedPnL,
      pnlPercent: Number(pnlPercent.toFixed(2)),
    };
  });
}

function markForAsset(asset: string, marks: SpotMarkPrices): number {
  if (asset === "BTC") return marks.btc > 0 ? marks.btc : 0;
  if (asset === "ETH") return marks.eth > 0 ? marks.eth : 0;
  return 0;
}

/** Average cost of remaining base inventory from SpotTrade history. */
function averageBuyPrice(trades: SpotTrade[], baseAsset: string): number {
  let quantity = 0;
  let cost = 0;
  const sorted = [...trades]
    .filter((t) => t.baseAsset === baseAsset)
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const trade of sorted) {
    if (trade.side === "BUY") {
      cost += trade.quantity * trade.price;
      quantity += trade.quantity;
      continue;
    }
    if (quantity <= 0) continue;
    const avg = cost / quantity;
    const sold = Math.min(trade.quantity, quantity);
    cost -= sold * avg;
    quantity -= sold;
  }

  return quantity > 0 ? cost / quantity : 0;
}
