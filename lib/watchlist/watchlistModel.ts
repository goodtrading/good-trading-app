import { getCatalogEntry } from "@/lib/assets/assetCatalog";
import type { AssetCatalogEntry, WatchlistAsset } from "@/lib/assets/types";
import {
  absFlipDistance,
  calculateFlipDistancePct,
} from "@/lib/watchlist/flipDistance";
import type { WatchlistMarketQuote } from "@/lib/watchlist/resolveWatchlistQuote";

export function filterCatalogByQuery(
  catalog: AssetCatalogEntry[],
  query: string,
): AssetCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return catalog;

  return catalog.filter((entry) => {
    const symbol = entry.symbol.toLowerCase();
    const name = entry.name.toLowerCase();
    return symbol.includes(normalized) || name.includes(normalized);
  });
}

function attachQuoteToAsset(
  asset: WatchlistAsset,
  quote: WatchlistMarketQuote | undefined,
): WatchlistAsset {
  if (!quote) return asset;

  if (quote.price != null) asset.price = quote.price;
  if (quote.change24h != null) asset.change24h = quote.change24h;
  if (quote.gammaRegime) asset.gammaRegime = quote.gammaRegime;
  if (quote.gammaFlip != null) asset.gammaFlip = quote.gammaFlip;

  if (asset.price != null && asset.gammaFlip != null) {
    asset.flipDistancePct = calculateFlipDistancePct(asset.price, asset.gammaFlip);
  }

  return asset;
}

export function buildWatchlistAssets(args: {
  followedSymbols: string[];
  quotes?: Record<string, WatchlistMarketQuote>;
}): WatchlistAsset[] {
  return args.followedSymbols
    .map((symbol) => {
      const entry = getCatalogEntry(symbol);
      if (!entry) return null;

      const quote = args.quotes?.[symbol];
      let asset: WatchlistAsset = {
        symbol: entry.symbol,
        name: entry.name,
        status: entry.status,
      };

      if (entry.status === "active") {
        asset = attachQuoteToAsset(asset, quote);
      }

      if (entry.status === "coming_soon") {
        if (entry.displayPrice != null) asset.price = entry.displayPrice;
        if (entry.displayChange24h != null) asset.change24h = entry.displayChange24h;
      }

      return asset;
    })
    .filter((item): item is WatchlistAsset => item != null);
}

export function sortWatchlistAssets(
  assets: WatchlistAsset[],
  activeSymbol: string,
): WatchlistAsset[] {
  return [...assets].sort((a, b) => {
    if (a.symbol === activeSymbol && b.symbol !== activeSymbol) return -1;
    if (b.symbol === activeSymbol && a.symbol !== activeSymbol) return 1;

    const distA = absFlipDistance(a.flipDistancePct);
    const distB = absFlipDistance(b.flipDistancePct);
    if (distA !== distB) return distA - distB;

    const changeA = Math.abs(a.change24h ?? 0);
    const changeB = Math.abs(b.change24h ?? 0);
    return changeB - changeA;
  });
}

export type WatchlistAction =
  | "view_analysis"
  | "go_home"
  | "go_portfolio"
  | "create_alert"
  | "unfollow"
  | "coming_soon";

export function getContextMenuOptions(status: WatchlistAsset["status"]): WatchlistAction[] {
  if (status === "coming_soon") {
    return ["view_analysis", "go_home", "go_portfolio", "create_alert", "coming_soon"];
  }
  return ["view_analysis", "go_home", "go_portfolio", "create_alert", "unfollow"];
}

export function resolveSearchSelection(symbol: string): {
  allowed: boolean;
  message?: string;
} {
  const entry = getCatalogEntry(symbol);
  if (!entry) return { allowed: false };
  if (entry.status === "coming_soon") {
    return { allowed: false, message: "Próximamente" };
  }
  return { allowed: true };
}

export function unfollowSymbol(
  followedSymbols: string[],
  symbol: string,
): string[] {
  return followedSymbols.filter((item) => item !== symbol);
}

export function followSymbolIfMissing(
  followedSymbols: string[],
  symbol: string,
): string[] {
  if (followedSymbols.includes(symbol)) return followedSymbols;
  return [...followedSymbols, symbol];
}

export function toggleFavoriteSymbol(
  favoriteSymbols: string[],
  symbol: string,
): string[] {
  if (favoriteSymbols.includes(symbol)) {
    return favoriteSymbols.filter((item) => item !== symbol);
  }
  return [...favoriteSymbols, symbol];
}

export function isFavoriteSymbol(favoriteSymbols: string[], symbol: string): boolean {
  return favoriteSymbols.includes(symbol);
}

export type WatchlistAuditField = {
  field: string;
  available: boolean;
  path: string;
};

export function buildWatchlistAuditTable(
  quote: WatchlistMarketQuote | undefined,
): WatchlistAuditField[] {
  return [
    {
      field: "spot",
      available: quote?.price != null,
      path: "v2.spot.value | legacy.data.market.spot",
    },
    {
      field: "change24h",
      available: quote?.change24h != null,
      path: "legacy.data.market.change24h | changePct | change",
    },
    {
      field: "changePct",
      available: quote?.change24h != null,
      path: "legacy.data.market.changePct (alias of change24h)",
    },
    {
      field: "volume",
      available: false,
      path: "—",
    },
    {
      field: "marketCap",
      available: false,
      path: "—",
    },
    {
      field: "gamma regime",
      available: quote?.gammaRegime != null,
      path: "v2.micro.localRegime | legacy.data.market.gammaRegime",
    },
    {
      field: "gamma flip",
      available: quote?.gammaFlip != null,
      path: "v2.micro.localGammaFlip | legacy.data.market.gammaFlip",
    },
  ];
}
