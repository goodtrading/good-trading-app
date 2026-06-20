import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ASSET_CATALOG, DEFAULT_ACTIVE_ASSET, canSelectAsset } from "./assetCatalog";
import { loadActiveAsset, saveActiveAsset } from "./storage";
import type { AssetCatalogEntry, TradingAsset } from "./types";

type ActiveAssetContextValue = {
  activeAsset: TradingAsset;
  setActiveAsset: (asset: TradingAsset) => void;
  catalog: AssetCatalogEntry[];
  isSupported: (symbol: string) => symbol is TradingAsset;
  hydrated: boolean;
};

const ActiveAssetContext = createContext<ActiveAssetContextValue | null>(null);

export function ActiveAssetProvider({ children }: { children: ReactNode }) {
  const [activeAsset, setActiveAssetState] = useState<TradingAsset>(DEFAULT_ACTIVE_ASSET);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadActiveAsset().then((stored) => {
      if (cancelled) return;
      if (canSelectAsset(stored)) {
        setActiveAssetState(stored);
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveAsset = useCallback((asset: TradingAsset) => {
    if (!canSelectAsset(asset)) return;
    setActiveAssetState(asset);
    void saveActiveAsset(asset);
  }, []);

  const value = useMemo<ActiveAssetContextValue>(
    () => ({
      activeAsset,
      setActiveAsset,
      catalog: ASSET_CATALOG,
      isSupported: (symbol: string): symbol is TradingAsset =>
        ASSET_CATALOG.some((entry) => entry.symbol === symbol),
      hydrated,
    }),
    [activeAsset, hydrated, setActiveAsset],
  );

  return <ActiveAssetContext.Provider value={value}>{children}</ActiveAssetContext.Provider>;
}

export function useActiveAsset(): ActiveAssetContextValue {
  const ctx = useContext(ActiveAssetContext);
  if (!ctx) {
    throw new Error("useActiveAsset must be used within ActiveAssetProvider");
  }
  return ctx;
}
