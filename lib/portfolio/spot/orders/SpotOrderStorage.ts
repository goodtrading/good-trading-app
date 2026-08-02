import AsyncStorage from "@react-native-async-storage/async-storage";

import { spotOrdersStorageKey } from "@/lib/portfolio/spot/storageKeys";
import type { SpotOrder } from "@/lib/portfolio/spot/types";

/**
 * Spot order persistence (separate from PERP `orders/v1`).
 * Phase 4: load/save only — no matching or fills.
 */
export class SpotOrderStorage {
  async load(walletId: string): Promise<SpotOrder[]> {
    const raw = await AsyncStorage.getItem(spotOrdersStorageKey(walletId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSpotOrderShape);
    } catch {
      return [];
    }
  }

  async save(walletId: string, orders: SpotOrder[]): Promise<void> {
    await AsyncStorage.setItem(spotOrdersStorageKey(walletId), JSON.stringify(orders));
  }
}

function isSpotOrderShape(value: unknown): value is SpotOrder {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<SpotOrder>;
  return o.domain === "SPOT" && typeof o.id === "string";
}

export const spotOrderStorage = new SpotOrderStorage();
