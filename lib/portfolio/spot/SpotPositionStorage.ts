import AsyncStorage from "@react-native-async-storage/async-storage";

import { spotPositionsStorageKey } from "@/lib/portfolio/spot/storageKeys";
import type { SpotPosition } from "@/lib/portfolio/spot/SpotPosition";

function isSpotPositionShape(value: unknown): value is SpotPosition {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<SpotPosition>;
  return (
    p.domain === "SPOT" &&
    typeof p.id === "string" &&
    typeof p.walletId === "string" &&
    typeof p.symbol === "string" &&
    typeof p.quantity === "number" &&
    typeof p.averageEntry === "number"
  );
}

export class SpotPositionStorage {
  async load(walletId: string): Promise<SpotPosition[]> {
    const raw = await AsyncStorage.getItem(spotPositionsStorageKey(walletId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isSpotPositionShape).map(normalize);
    } catch {
      return [];
    }
  }

  async save(walletId: string, positions: SpotPosition[]): Promise<void> {
    await AsyncStorage.setItem(
      spotPositionsStorageKey(walletId),
      JSON.stringify(positions.map(normalize)),
    );
  }
}

function normalize(position: SpotPosition): SpotPosition {
  return {
    ...position,
    domain: "SPOT",
    realizedPnL: position.realizedPnL ?? 0,
    status: position.status === "CLOSED" ? "CLOSED" : "OPEN",
  };
}

export const spotPositionStorage = new SpotPositionStorage();
