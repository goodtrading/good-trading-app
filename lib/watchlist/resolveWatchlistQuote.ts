import { MOBILE_STATE_V2_ENABLED } from "@/lib/feature-flags";
import { formatValuedField } from "@/lib/market-state/dataStatusUi";
import {
  formatRegimeForHeader,
  readV2MicroRegime,
} from "@/lib/market-state/headerRegimeView";
import type { MicroContext } from "@/lib/market-state/v2DataSchema";

type LegacyMarket = {
  market?: {
    spot?: unknown;
    change24h?: unknown;
    changePct?: unknown;
    change?: unknown;
    gammaRegime?: unknown;
    gammaFlip?: unknown;
  };
};

export type WatchlistMarketQuote = {
  price?: number;
  change24h?: number;
  gammaRegime?: string;
  gammaFlip?: number;
};

function normalizeLegacyGammaRegime(value: unknown): string | undefined {
  const text = String(value ?? "").toUpperCase();
  if (!text.trim()) return undefined;
  if (text.includes("SHORT")) return "SHORT GAMMA";
  if (text.includes("LONG")) return "LONG GAMMA";
  if (text.includes("TRANSITION")) return "TRANSITION GAMMA";
  return undefined;
}

export function resolveWatchlistQuote(args: {
  symbol: string;
  marketStateSource: string;
  legacyMarket: unknown;
  v2Spot: { value: number | null; status: string } | null | undefined;
  v2Micro: MicroContext | null | undefined;
}): WatchlistMarketQuote {
  const isV2MarketState = args.marketStateSource === "v2" && MOBILE_STATE_V2_ENABLED;
  const raw = args.legacyMarket as LegacyMarket | null | undefined;

  const legacyPrice = Number(raw?.market?.spot);
  const v2PriceRaw =
    isV2MarketState && args.v2Spot
      ? formatValuedField(args.v2Spot.status, args.v2Spot.value, (value) => String(value))
      : null;
  const v2Price = v2PriceRaw != null ? Number(v2PriceRaw) : null;

  const price = Number.isFinite(v2Price) ? v2Price : Number.isFinite(legacyPrice) ? legacyPrice : undefined;

  const legacyChange =
    raw?.market?.change24h ?? raw?.market?.changePct ?? raw?.market?.change ?? undefined;
  const change24h = Number(legacyChange);

  let gammaRegime: string | undefined;
  if (isV2MarketState && args.v2Micro) {
    const formatted = formatRegimeForHeader(readV2MicroRegime(args.v2Micro));
    if (formatted !== "REGIME UNAVAILABLE") {
      gammaRegime = formatted;
    }
  } else {
    gammaRegime = normalizeLegacyGammaRegime(raw?.market?.gammaRegime);
  }

  const legacyFlip = Number(raw?.market?.gammaFlip);
  const v2FlipRaw =
    isV2MarketState && args.v2Micro?.localGammaFlip
      ? formatValuedField(
          args.v2Micro.localGammaFlip.status,
          args.v2Micro.localGammaFlip.value,
          (value) => String(value),
        )
      : null;
  const v2Flip = v2FlipRaw != null ? Number(v2FlipRaw) : null;
  const gammaFlip = Number.isFinite(v2Flip) ? v2Flip : Number.isFinite(legacyFlip) ? legacyFlip : undefined;

  return {
    price,
    change24h: Number.isFinite(change24h) ? change24h : undefined,
    gammaRegime,
    gammaFlip,
  };
}

/** @deprecated Use resolveWatchlistQuote */
export function resolveBtcSpotQuote(args: {
  marketStateSource: string;
  legacyMarket: unknown;
  v2Spot: { value: number | null; status: string } | null | undefined;
}): { price?: number; change24h?: number } {
  const quote = resolveWatchlistQuote({
    symbol: "BTC",
    ...args,
    v2Micro: null,
  });
  return { price: quote.price, change24h: quote.change24h };
}
