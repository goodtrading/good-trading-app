import type { AssetCatalogEntry, TradingAsset } from "./types";

export const ASSET_CATALOG: AssetCatalogEntry[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    status: "active",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    status: "coming_soon",
    displayPrice: 1_842,
    displayChange24h: -3.12,
  },
];

export const DEFAULT_ACTIVE_ASSET: TradingAsset = "BTC";

export const DEFAULT_FOLLOWED_SYMBOLS: TradingAsset[] = ["BTC", "ETH"];

export function getCatalogEntry(symbol: string): AssetCatalogEntry | undefined {
  return ASSET_CATALOG.find((entry) => entry.symbol === symbol);
}

export function isTradingAsset(symbol: string): symbol is TradingAsset {
  return ASSET_CATALOG.some((entry) => entry.symbol === symbol);
}

export function canSelectAsset(symbol: string): symbol is TradingAsset {
  const entry = getCatalogEntry(symbol);
  return entry?.status === "active";
}
