import AsyncStorage from "@react-native-async-storage/async-storage";

import { hydrateOcoGroup, type OcoGroup } from "@/lib/portfolio/oco/OcoGroup";

export function ocoStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/oco/v1`;
}

export async function loadOcoGroups(walletId: string): Promise<OcoGroup[]> {
  const raw = await AsyncStorage.getItem(ocoStorageKey(walletId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOcoGroupShape).map(hydrateOcoGroup);
  } catch {
    return [];
  }
}

export async function saveOcoGroups(walletId: string, groups: OcoGroup[]): Promise<void> {
  await AsyncStorage.setItem(ocoStorageKey(walletId), JSON.stringify(groups));
}

function isOcoGroupShape(value: unknown): value is OcoGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<OcoGroup>;
  return (
    typeof group.id === "string" &&
    typeof group.walletId === "string" &&
    typeof group.symbol === "string" &&
    typeof group.positionSide === "string" &&
    typeof group.takeProfitOrderId === "string" &&
    typeof group.stopLossOrderId === "string" &&
    typeof group.status === "string"
  );
}
