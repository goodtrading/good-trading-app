import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_FOLLOWED_SYMBOLS, isTradingAsset } from "@/lib/assets/assetCatalog";
import type { TradingAsset } from "@/lib/assets/types";

const FOLLOWED_SYMBOLS_STORAGE_KEY = "gt_watchlist_followed_v1";
const FAVORITE_SYMBOLS_STORAGE_KEY = "gt_watchlist_favorites_v1";

export async function loadFollowedSymbols(): Promise<TradingAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOWED_SYMBOLS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_FOLLOWED_SYMBOLS];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_FOLLOWED_SYMBOLS];

    const symbols = parsed.filter((item): item is TradingAsset => isTradingAsset(String(item)));
    return symbols.length > 0 ? symbols : [...DEFAULT_FOLLOWED_SYMBOLS];
  } catch {
    return [...DEFAULT_FOLLOWED_SYMBOLS];
  }
}

export async function saveFollowedSymbols(symbols: TradingAsset[]): Promise<void> {
  await AsyncStorage.setItem(FOLLOWED_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
}

export async function loadFavoriteSymbols(): Promise<TradingAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITE_SYMBOLS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is TradingAsset => isTradingAsset(String(item)));
  } catch {
    return [];
  }
}

export async function saveFavoriteSymbols(symbols: TradingAsset[]): Promise<void> {
  await AsyncStorage.setItem(FAVORITE_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
}
