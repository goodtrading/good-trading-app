import AsyncStorage from "@react-native-async-storage/async-storage";

import type { CarteraContext } from "@/lib/cartera/types";
import { CARTERA_CONTEXTS, DEFAULT_CARTERA_CONTEXT } from "@/lib/cartera/types";

export const CARTERA_ACTIVE_CONTEXT_STORAGE_KEY = "@goodtrading/cartera/active-context/v1";

export async function loadActiveCarteraContext(): Promise<CarteraContext> {
  const raw = await AsyncStorage.getItem(CARTERA_ACTIVE_CONTEXT_STORAGE_KEY);
  if (!raw) return DEFAULT_CARTERA_CONTEXT;

  if (CARTERA_CONTEXTS.includes(raw as CarteraContext)) {
    return raw as CarteraContext;
  }

  return DEFAULT_CARTERA_CONTEXT;
}

export async function saveActiveCarteraContext(context: CarteraContext): Promise<void> {
  await AsyncStorage.setItem(CARTERA_ACTIVE_CONTEXT_STORAGE_KEY, context);
}
