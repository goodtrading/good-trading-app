import AsyncStorage from "@react-native-async-storage/async-storage";

export type TradingMode = "SPOT" | "PERP";

export type TradingWorkspaceTab = "positions" | "orders" | "history";

export const TRADING_MODE_STORAGE_KEY = "@goodtrading/cartera/trading-mode/v2";
export const TRADING_WORKSPACE_TAB_STORAGE_KEY =
  "@goodtrading/cartera/trading-workspace-tab/v1";

/** Legacy Classic/Exchange key — migrated once. */
const LEGACY_VIEW_KEY = "@goodtrading/cartera/trading-view/v1";

export const DEFAULT_TRADING_MODE: TradingMode = "PERP";
export const DEFAULT_WORKSPACE_TAB: TradingWorkspaceTab = "positions";

function parseMode(raw: string | null): TradingMode | null {
  if (raw === "SPOT" || raw === "PERP") return raw;
  if (raw === "CLASSIC") return "PERP";
  if (raw === "EXCHANGE") return "SPOT";
  return null;
}

function parseTab(raw: string | null): TradingWorkspaceTab | null {
  if (raw === "positions" || raw === "orders" || raw === "history") return raw;
  return null;
}

export async function loadTradingMode(): Promise<TradingMode> {
  const stored = await AsyncStorage.getItem(TRADING_MODE_STORAGE_KEY);
  const fromV2 = parseMode(stored);
  if (fromV2) return fromV2;

  const legacy = await AsyncStorage.getItem(LEGACY_VIEW_KEY);
  const migrated = parseMode(legacy);
  if (migrated) {
    await AsyncStorage.setItem(TRADING_MODE_STORAGE_KEY, migrated);
    return migrated;
  }

  return DEFAULT_TRADING_MODE;
}

export async function saveTradingMode(mode: TradingMode): Promise<void> {
  await AsyncStorage.setItem(TRADING_MODE_STORAGE_KEY, mode);
}

export async function loadTradingWorkspaceTab(): Promise<TradingWorkspaceTab> {
  const stored = await AsyncStorage.getItem(TRADING_WORKSPACE_TAB_STORAGE_KEY);
  return parseTab(stored) ?? DEFAULT_WORKSPACE_TAB;
}

export async function saveTradingWorkspaceTab(
  tab: TradingWorkspaceTab,
): Promise<void> {
  await AsyncStorage.setItem(TRADING_WORKSPACE_TAB_STORAGE_KEY, tab);
}
