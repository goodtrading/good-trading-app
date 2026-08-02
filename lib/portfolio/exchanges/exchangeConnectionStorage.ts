import AsyncStorage from "@react-native-async-storage/async-storage";

export type ExchangeId = "binance" | "bingx";

export type ExchangeConnections = Record<ExchangeId, { connected: boolean }>;

const STORAGE_KEY = "@goodtrading/portfolio/exchanges/connections/v1";

const DEFAULT_CONNECTIONS = (): ExchangeConnections => ({
  binance: { connected: false },
  bingx: { connected: false },
});

export async function loadExchangeConnections(): Promise<ExchangeConnections> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CONNECTIONS();

  const parsed = JSON.parse(raw) as Partial<ExchangeConnections>;
  return {
    binance: { connected: parsed.binance?.connected === true },
    bingx: { connected: parsed.bingx?.connected === true },
  };
}

export async function saveExchangeConnections(connections: ExchangeConnections): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
}

export async function setExchangeConnected(
  exchangeId: ExchangeId,
  connected: boolean,
): Promise<ExchangeConnections> {
  const current = await loadExchangeConnections();
  const next = { ...current, [exchangeId]: { connected } };
  await saveExchangeConnections(next);
  return next;
}
