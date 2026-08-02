import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createEmptyInsuranceFundState,
  hydrateInsuranceFundState,
  type InsuranceFundState,
} from "@/lib/portfolio/insurance/InsuranceFund";

export function insuranceStorageKey(walletId: string): string {
  return `@goodtrading/portfolio/accounts/${walletId}/insurance/v1`;
}

export async function loadInsuranceFund(walletId: string): Promise<InsuranceFundState> {
  const raw = await AsyncStorage.getItem(insuranceStorageKey(walletId));
  if (!raw) return createEmptyInsuranceFundState(walletId);

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return createEmptyInsuranceFundState(walletId);
    }
    return hydrateInsuranceFundState({
      ...createEmptyInsuranceFundState(walletId),
      ...(parsed as InsuranceFundState),
      walletId,
    });
  } catch {
    return createEmptyInsuranceFundState(walletId);
  }
}

export async function saveInsuranceFund(
  walletId: string,
  state: InsuranceFundState,
): Promise<void> {
  await AsyncStorage.setItem(
    insuranceStorageKey(walletId),
    JSON.stringify(hydrateInsuranceFundState({ ...state, walletId })),
  );
}
