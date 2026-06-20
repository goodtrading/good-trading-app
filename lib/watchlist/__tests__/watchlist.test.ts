import { beforeEach, describe, expect, it, vi } from "vitest";

import { ASSET_CATALOG, canSelectAsset } from "@/lib/assets/assetCatalog";
import { loadActiveAsset, saveActiveAsset } from "@/lib/assets/storage";
import { toWatchlistAssetViewModel } from "@/lib/watchlist/formatters";
import {
  calculateFlipDistancePct,
  formatFlipDistanceLabel,
  resolveFlipDistanceTone,
} from "@/lib/watchlist/flipDistance";
import {
  loadFavoriteSymbols,
  loadFollowedSymbols,
  saveFavoriteSymbols,
  saveFollowedSymbols,
} from "@/lib/watchlist/storage";
import { resolveBtcSpotQuote, resolveWatchlistQuote } from "@/lib/watchlist/resolveWatchlistQuote";
import {
  buildWatchlistAssets,
  buildWatchlistAuditTable,
  filterCatalogByQuery,
  followSymbolIfMissing,
  getContextMenuOptions,
  isFavoriteSymbol,
  resolveSearchSelection,
  sortWatchlistAssets,
  toggleFavoriteSymbol,
  unfollowSymbol,
} from "@/lib/watchlist/watchlistModel";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  },
}));

describe("watchlist model", () => {
  beforeEach(() => {
    store.clear();
  });

  it("selects BTC and blocks ETH in search", () => {
    expect(resolveSearchSelection("BTC")).toEqual({ allowed: true });
    expect(resolveSearchSelection("ETH")).toEqual({
      allowed: false,
      message: "Próximamente",
    });
  });

  it("filters catalog by symbol and name", () => {
    expect(filterCatalogByQuery(ASSET_CATALOG, "btc").map((item) => item.symbol)).toEqual(["BTC"]);
    expect(filterCatalogByQuery(ASSET_CATALOG, "ether").map((item) => item.symbol)).toEqual(["ETH"]);
    expect(filterCatalogByQuery(ASSET_CATALOG, "")).toHaveLength(2);
    expect(filterCatalogByQuery(ASSET_CATALOG, "xyz")).toHaveLength(0);
  });

  it("builds BTC with live quote including flip distance", () => {
    const assets = buildWatchlistAssets({
      followedSymbols: ["BTC", "ETH"],
      quotes: {
        BTC: {
          price: 63_250,
          change24h: 1.25,
          gammaRegime: "LONG GAMMA",
          gammaFlip: 63_334,
        },
      },
    });

    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      symbol: "BTC",
      status: "active",
      price: 63_250,
      change24h: 1.25,
      gammaRegime: "LONG GAMMA",
      gammaFlip: 63_334,
    });
    expect(assets[0].flipDistancePct).toBeCloseTo(-0.1325, 3);
    expect(assets[1]).toMatchObject({
      symbol: "ETH",
      status: "coming_soon",
      price: 1_842,
      change24h: -3.12,
    });
  });

  it("maps asset to operational view model with flip distance", () => {
    const viewModel = toWatchlistAssetViewModel(
      {
        symbol: "BTC",
        name: "Bitcoin",
        status: "active",
        price: 63_250,
        change24h: 1.25,
        gammaRegime: "LONG GAMMA",
        gammaFlip: 63_334,
        flipDistancePct: -0.13,
      },
      true,
      true,
    );

    expect(viewModel).toMatchObject({
      symbol: "BTC",
      price: "$63,250",
      change: "+1.25%",
      changeDirection: "up",
      gammaRegime: "LONG GAMMA",
      regimeTone: "long",
      localFlip: "$63,334",
      showLocalFlip: true,
      flipDistance: "-0.13% bajo Flip",
      flipDistanceTone: "below",
      isFavorite: true,
      isActive: true,
    });
  });

  it("sorts by active symbol, flip distance, then change magnitude", () => {
    const sorted = sortWatchlistAssets(
      [
        {
          symbol: "ETH",
          name: "Ethereum",
          status: "coming_soon",
          change24h: -3.12,
          flipDistancePct: 0.5,
        },
        {
          symbol: "BTC",
          name: "Bitcoin",
          status: "active",
          change24h: 1.25,
          flipDistancePct: 0.1,
        },
      ],
      "ETH",
    );

    expect(sorted.map((item) => item.symbol)).toEqual(["ETH", "BTC"]);
  });

  it("sorts non-active assets by flip distance then change", () => {
    const sorted = sortWatchlistAssets(
      [
        {
          symbol: "ETH",
          name: "Ethereum",
          status: "coming_soon",
          change24h: 1,
          flipDistancePct: 2,
        },
        {
          symbol: "BTC",
          name: "Bitcoin",
          status: "active",
          change24h: 5,
          flipDistancePct: 0.5,
        },
      ],
      "SPX",
    );

    expect(sorted.map((item) => item.symbol)).toEqual(["BTC", "ETH"]);
  });

  it("toggles favorites in memory", () => {
    expect(toggleFavoriteSymbol([], "BTC")).toEqual(["BTC"]);
    expect(toggleFavoriteSymbol(["BTC"], "BTC")).toEqual([]);
    expect(isFavoriteSymbol(["BTC"], "BTC")).toBe(true);
    expect(isFavoriteSymbol([], "BTC")).toBe(false);
  });

  it("exposes contextual menu options by status", () => {
    expect(getContextMenuOptions("active")).toEqual([
      "view_analysis",
      "go_home",
      "go_portfolio",
      "create_alert",
      "unfollow",
    ]);
    expect(getContextMenuOptions("coming_soon")).toEqual([
      "view_analysis",
      "go_home",
      "go_portfolio",
      "create_alert",
      "coming_soon",
    ]);
  });

  it("builds audit table for BTC quote", () => {
    const table = buildWatchlistAuditTable({
      price: 63_250,
      change24h: 1.25,
      gammaRegime: "LONG GAMMA",
      gammaFlip: 64_500,
    });

    expect(table.find((row) => row.field === "spot")?.available).toBe(true);
    expect(table.find((row) => row.field === "volume")?.available).toBe(false);
    expect(table.find((row) => row.field === "gamma regime")?.available).toBe(true);
  });

  it("removes and restores followed symbols", () => {
    expect(unfollowSymbol(["BTC", "ETH"], "BTC")).toEqual(["ETH"]);
    expect(followSymbolIfMissing(["ETH"], "BTC")).toEqual(["ETH", "BTC"]);
  });

  it("only allows selecting active assets", () => {
    expect(canSelectAsset("BTC")).toBe(true);
    expect(canSelectAsset("ETH")).toBe(false);
  });
});

describe("flip distance", () => {
  it("calculates distance pct from spot and flip", () => {
    expect(calculateFlipDistancePct(63_250, 63_334)).toBeCloseTo(-0.1325, 3);
    expect(calculateFlipDistancePct(64_000, 63_334)).toBeCloseTo(1.051, 2);
  });

  it("formats distance labels above and below flip", () => {
    expect(formatFlipDistanceLabel(0.42)).toBe("+0.42% sobre Flip");
    expect(formatFlipDistanceLabel(-0.42)).toBe("-0.42% bajo Flip");
  });

  it("resolves tone from spot relative to flip", () => {
    expect(resolveFlipDistanceTone(64_000, 63_334)).toBe("above");
    expect(resolveFlipDistanceTone(63_000, 63_334)).toBe("below");
    expect(resolveFlipDistanceTone(63_334, 63_334)).toBe("neutral");
  });
});

describe("watchlist persistence", () => {
  beforeEach(() => {
    store.clear();
  });

  it("persists active asset", async () => {
    await saveActiveAsset("BTC");
    expect(await loadActiveAsset()).toBe("BTC");
  });

  it("persists followed symbols after unfollow", async () => {
    await saveFollowedSymbols(["ETH"]);
    expect(await loadFollowedSymbols()).toEqual(["ETH"]);
  });

  it("persists favorite symbols", async () => {
    await saveFavoriteSymbols(["BTC"]);
    expect(await loadFavoriteSymbols()).toEqual(["BTC"]);
    await saveFavoriteSymbols([]);
    expect(await loadFavoriteSymbols()).toEqual([]);
  });
});

describe("resolveWatchlistQuote", () => {
  it("prefers v2 spot when source is v2", () => {
    const quote = resolveWatchlistQuote({
      symbol: "BTC",
      marketStateSource: "v2",
      legacyMarket: { market: { spot: 80_000 } },
      v2Spot: { value: 85_180.4, status: "available" },
      v2Micro: {
        localRegime: { value: "LONG_GAMMA", status: "available" },
        localGammaFlip: { value: 63_334, status: "available" },
      } as never,
    });

    expect(quote.price).toBe(85_180.4);
    expect(quote.gammaRegime).toBe("LONG GAMMA");
    expect(quote.gammaFlip).toBe(63_334);
  });

  it("falls back to legacy spot and change when v2 is unavailable", () => {
    const quote = resolveWatchlistQuote({
      symbol: "BTC",
      marketStateSource: "legacy",
      legacyMarket: {
        market: { spot: 80_123, change24h: -1.2, gammaRegime: "SHORT_GAMMA", gammaFlip: 79_000 },
      },
      v2Spot: null,
      v2Micro: null,
    });

    expect(quote.price).toBe(80_123);
    expect(quote.change24h).toBe(-1.2);
    expect(quote.gammaRegime).toBe("SHORT GAMMA");
    expect(quote.gammaFlip).toBe(79_000);
  });
});

describe("resolveBtcSpotQuote", () => {
  it("keeps backward-compatible price and change shape", () => {
    const quote = resolveBtcSpotQuote({
      marketStateSource: "legacy",
      legacyMarket: { market: { spot: 80_123, change24h: -1.2 } },
      v2Spot: null,
    });

    expect(quote.price).toBe(80_123);
    expect(quote.change24h).toBe(-1.2);
  });
});
