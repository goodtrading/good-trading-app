import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_ACTIVE_ASSET, isTradingAsset } from "./assetCatalog";
import type { TradingAsset } from "./types";

const ACTIVE_ASSET_STORAGE_KEY = "gt_active_asset_v1";

export async function loadActiveAsset(): Promise<TradingAsset> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_ASSET_STORAGE_KEY);
    if (!raw) return DEFAULT_ACTIVE_ASSET;
    if (isTradingAsset(raw)) return raw;
    return DEFAULT_ACTIVE_ASSET;
  } catch {
    return DEFAULT_ACTIVE_ASSET;
  }
}

export async function saveActiveAsset(asset: TradingAsset): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_ASSET_STORAGE_KEY, asset);
}
