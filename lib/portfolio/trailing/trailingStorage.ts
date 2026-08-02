import AsyncStorage from "@react-native-async-storage/async-storage";

import { hydrateTrailingStop, type TrailingStop } from "@/lib/portfolio/trailing/TrailingStop";

export function trailingStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/trailing/v1`;
}

export async function loadTrailingStops(walletId: string): Promise<TrailingStop[]> {
  const raw = await AsyncStorage.getItem(trailingStorageKey(walletId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTrailingStopShape).map(hydrateTrailingStop);
  } catch {
    return [];
  }
}

export async function saveTrailingStops(
  walletId: string,
  stops: TrailingStop[],
): Promise<void> {
  await AsyncStorage.setItem(trailingStorageKey(walletId), JSON.stringify(stops));
}

function isTrailingStopShape(value: unknown): value is TrailingStop {
  if (!value || typeof value !== "object") return false;
  const stop = value as Partial<TrailingStop>;
  return (
    typeof stop.id === "string" &&
    typeof stop.walletId === "string" &&
    typeof stop.symbol === "string" &&
    typeof stop.positionSide === "string" &&
    typeof stop.callbackRate === "number" &&
    typeof stop.quantity === "number" &&
    typeof stop.status === "string"
  );
}
