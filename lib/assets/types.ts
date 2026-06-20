export type AssetStatus = "active" | "coming_soon";

export type TradingAsset = "BTC" | "ETH";

export type WatchlistAsset = {
  symbol: string;
  name: string;
  status: AssetStatus;
  price?: number;
  change24h?: number;
  gammaRegime?: string;
  gammaFlip?: number;
  flipDistancePct?: number;
};

export type AssetCatalogEntry = {
  symbol: TradingAsset;
  name: string;
  status: AssetStatus;
  /** Static display values for coming_soon assets only. */
  displayPrice?: number;
  displayChange24h?: number;
};
