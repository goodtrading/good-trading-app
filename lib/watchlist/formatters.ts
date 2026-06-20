import type { AssetStatus, WatchlistAsset } from "@/lib/assets/types";
import {
  formatFlipDistanceLabel,
  resolveFlipDistanceTone,
  type FlipDistanceTone,
} from "@/lib/watchlist/flipDistance";
import { resolveHeaderRegimeTone } from "@/lib/market-state/headerRegimeView";

export type WatchlistRegimeTone = "long" | "short" | "neutral";

export type WatchlistAssetViewModel = {
  symbol: string;
  name: string;
  price: string;
  change?: string;
  changeDirection: "up" | "down" | "neutral";
  showChange: boolean;
  gammaRegime?: string;
  regimeTone: WatchlistRegimeTone;
  showRegime: boolean;
  localFlip?: string;
  showLocalFlip: boolean;
  flipDistance?: string;
  flipDistanceTone: FlipDistanceTone;
  showFlipDistance: boolean;
  isFavorite: boolean;
  status: AssetStatus;
  isActive: boolean;
};

export function formatWatchlistPrice(price?: number): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatWatchlistChange(change24h?: number): {
  label: string;
  direction: "up" | "down" | "neutral";
} {
  if (change24h == null || !Number.isFinite(change24h)) {
    return { label: "—", direction: "neutral" };
  }

  const sign = change24h > 0 ? "+" : "";
  return {
    label: `${sign}${change24h.toFixed(2)}%`,
    direction: change24h > 0 ? "up" : change24h < 0 ? "down" : "neutral",
  };
}

function resolveRegimeTone(regime?: string): WatchlistRegimeTone {
  if (!regime) return "neutral";
  const tone = resolveHeaderRegimeTone(regime);
  if (tone === "long") return "long";
  if (tone === "short") return "short";
  return "neutral";
}

export function toWatchlistAssetViewModel(
  asset: WatchlistAsset,
  isActive: boolean,
  isFavorite: boolean,
): WatchlistAssetViewModel {
  const price = formatWatchlistPrice(asset.price);
  const change = formatWatchlistChange(asset.change24h);
  const hasChange = asset.change24h != null && Number.isFinite(asset.change24h);
  const regimeTone = resolveRegimeTone(asset.gammaRegime);
  const hasFlip = asset.gammaFlip != null && Number.isFinite(asset.gammaFlip);
  const hasDistance =
    asset.flipDistancePct != null &&
    Number.isFinite(asset.flipDistancePct) &&
    asset.price != null &&
    hasFlip;

  let flipDistanceTone: FlipDistanceTone = "neutral";
  if (hasDistance && asset.price != null && asset.gammaFlip != null) {
    flipDistanceTone = resolveFlipDistanceTone(asset.price, asset.gammaFlip);
  }

  return {
    symbol: asset.symbol,
    name: asset.name,
    price: price === "—" ? "—" : `$${price}`,
    change: hasChange ? change.label : undefined,
    changeDirection: change.direction,
    showChange: hasChange,
    gammaRegime: asset.gammaRegime,
    regimeTone,
    showRegime: Boolean(asset.gammaRegime),
    localFlip: hasFlip ? `$${formatWatchlistPrice(asset.gammaFlip)}` : undefined,
    showLocalFlip: hasFlip,
    flipDistance: hasDistance ? formatFlipDistanceLabel(asset.flipDistancePct!) : undefined,
    flipDistanceTone,
    showFlipDistance: hasDistance,
    isFavorite,
    status: asset.status,
    isActive,
  };
}

/** @deprecated Use toWatchlistAssetViewModel */
export function toWatchlistItemProps(
  asset: WatchlistAsset,
  isActive: boolean,
  isFavorite = false,
) {
  return toWatchlistAssetViewModel(asset, isActive, isFavorite);
}
