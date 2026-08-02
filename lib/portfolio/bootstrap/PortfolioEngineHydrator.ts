import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Order } from "@/lib/portfolio/orders/OrderEngine";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { PortfolioEngineState, PositionMode } from "@/lib/portfolio/types";
import {
  DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  type PerpAccountPositionMode,
} from "@/lib/portfolio/hedge/PerpAccountPositionMode";

export type EngineRuntimeMeta = {
  leverage: number;
  positionMode: PositionMode;
  accountPositionMode: PerpAccountPositionMode;
  openLimitOrders: Order[];
};

export type HydrationResult = {
  accountId: string;
  state: PortfolioEngineState | null;
  meta: EngineRuntimeMeta;
  limitOrdersRestored: number;
};

const DEFAULT_META: EngineRuntimeMeta = {
  leverage: 1,
  positionMode: "LONG_ONLY",
  accountPositionMode: DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  openLimitOrders: [],
};

export function engineRuntimeMetaStorageKey(accountId: string): string {
  return `@goodtrading/portfolio/accounts/${accountId}/engine-meta/v1`;
}

function normalizeMeta(raw: unknown): EngineRuntimeMeta {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_META };
  }

  const candidate = raw as Partial<EngineRuntimeMeta>;
  const leverage =
    typeof candidate.leverage === "number" &&
    Number.isFinite(candidate.leverage) &&
    candidate.leverage > 0
      ? candidate.leverage
      : 1;

  const positionMode: PositionMode =
    candidate.positionMode === "LONG_SHORT" ? "LONG_SHORT" : "LONG_ONLY";

  const accountPositionMode: PerpAccountPositionMode =
    candidate.accountPositionMode === "HEDGE" ? "HEDGE" : DEFAULT_PERP_ACCOUNT_POSITION_MODE;

  const openLimitOrders = Array.isArray(candidate.openLimitOrders)
    ? candidate.openLimitOrders.filter(
        (order): order is Order =>
          !!order &&
          typeof order === "object" &&
          typeof order.id === "string" &&
          order.type === "LIMIT" &&
          order.status === "OPEN",
      )
    : [];

  return { leverage, positionMode, accountPositionMode, openLimitOrders };
}

/**
 * Loads persisted engine metadata (leverage, mode, OPEN limit orders).
 * Ledger trades remain in PortfolioStorage / AsyncStorage.
 */
export async function loadEngineRuntimeMeta(accountId: string): Promise<EngineRuntimeMeta> {
  const raw = await AsyncStorage.getItem(engineRuntimeMetaStorageKey(accountId));
  if (!raw) {
    return { ...DEFAULT_META };
  }

  try {
    return normalizeMeta(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_META };
  }
}

/**
 * Persists engine metadata for the account (not the ledger).
 */
export async function saveEngineRuntimeMeta(
  accountId: string,
  meta: EngineRuntimeMeta,
): Promise<void> {
  await AsyncStorage.setItem(
    engineRuntimeMetaStorageKey(accountId),
    JSON.stringify({
      leverage: meta.leverage,
      positionMode: meta.positionMode,
      accountPositionMode: meta.accountPositionMode,
      openLimitOrders: meta.openLimitOrders,
    }),
  );
}

export async function captureEngineRuntimeMeta(
  accountId: string,
  engine: PortfolioEngine,
): Promise<EngineRuntimeMeta> {
  const meta: EngineRuntimeMeta = {
    leverage: engine.getLeverage(),
    positionMode: engine.getPositionMode(),
    accountPositionMode: engine.getAccountPositionMode(),
    openLimitOrders: engine.snapshotLimitOrders(),
  };
  await saveEngineRuntimeMeta(accountId, meta);
  return meta;
}

export type HydratePortfolioEngineOptions = {
  /**
   * When true (default), applies stored leverage/positionMode.
   * Set false when the caller already configured the engine (e.g. explicit start config).
   */
  applyStoredConfig?: boolean;
};

/**
 * Rebuilds engine configuration deterministically from storage:
 * - trades/positions via ledger (PortfolioStorage)
 * - leverage + positionMode + OPEN LIMIT orders via engine-meta key
 * RiskScheduler is reattached by PortfolioEngineBootstrap.start (caller).
 */
export async function hydratePortfolioEngine(
  engine: PortfolioEngine,
  accountId: string,
  marketPrice: number | null = null,
  options: HydratePortfolioEngineOptions = {},
): Promise<HydrationResult> {
  const meta = await loadEngineRuntimeMeta(accountId);
  const applyStoredConfig = options.applyStoredConfig ?? true;

  if (applyStoredConfig) {
    try {
      engine.setLeverage(meta.leverage);
    } catch {
      engine.setLeverage(1);
    }
    engine.setPositionMode(meta.positionMode);
    engine.setAccountPositionMode(meta.accountPositionMode);
  }

  engine.reattachLimitOrders(meta.openLimitOrders);

  let state: PortfolioEngineState | null = null;
  if (marketPrice != null && Number.isFinite(marketPrice) && marketPrice > 0) {
    state = await engine.getState(marketPrice);
  }

  console.log("[ENGINE HYDRATION COMPLETE]", {
    accountId,
    leverage: engine.getLeverage(),
    positionMode: engine.getPositionMode(),
    limitOrdersRestored: meta.openLimitOrders.length,
    tradeCount: state?.trades.length ?? null,
    positionCount: state?.positions.length ?? null,
  });

  return {
    accountId,
    state,
    meta,
    limitOrdersRestored: meta.openLimitOrders.length,
  };
}
