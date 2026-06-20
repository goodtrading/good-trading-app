import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DEFAULT_FOLLOWED_SYMBOLS, isTradingAsset } from "@/lib/assets/assetCatalog";
import type { TradingAsset } from "@/lib/assets/types";

import {
  loadFavoriteSymbols,
  loadFollowedSymbols,
  saveFavoriteSymbols,
  saveFollowedSymbols,
} from "./storage";
import { followSymbolIfMissing, toggleFavoriteSymbol, unfollowSymbol } from "./watchlistModel";

type WatchlistContextValue = {
  followedSymbols: TradingAsset[];
  favoriteSymbols: TradingAsset[];
  unfollow: (symbol: TradingAsset) => void;
  ensureFollowed: (symbol: TradingAsset) => void;
  toggleFavorite: (symbol: TradingAsset) => void;
  hydrated: boolean;
};

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [followedSymbols, setFollowedSymbols] = useState<TradingAsset[]>([
    ...DEFAULT_FOLLOWED_SYMBOLS,
  ]);
  const [favoriteSymbols, setFavoriteSymbols] = useState<TradingAsset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([loadFollowedSymbols(), loadFavoriteSymbols()]).then(([stored, favorites]) => {
      if (cancelled) return;
      setFollowedSymbols(stored);
      setFavoriteSymbols(favorites);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const unfollow = useCallback(
    (symbol: TradingAsset) => {
      setFollowedSymbols((current) => {
        const next = unfollowSymbol(current, symbol) as TradingAsset[];
        void saveFollowedSymbols(next);
        return next;
      });
      setFavoriteSymbols((current) => {
        if (!current.includes(symbol)) return current;
        const next = current.filter((item) => item !== symbol) as TradingAsset[];
        void saveFavoriteSymbols(next);
        return next;
      });
    },
    [],
  );

  const ensureFollowed = useCallback(
    (symbol: TradingAsset) => {
      if (!isTradingAsset(symbol)) return;
      setFollowedSymbols((current) => {
        const next = followSymbolIfMissing(current, symbol) as TradingAsset[];
        if (next.length === current.length) return current;
        void saveFollowedSymbols(next);
        return next;
      });
    },
    [],
  );

  const toggleFavorite = useCallback((symbol: TradingAsset) => {
    if (!isTradingAsset(symbol)) return;
    setFavoriteSymbols((current) => {
      const next = toggleFavoriteSymbol(current, symbol) as TradingAsset[];
      void saveFavoriteSymbols(next);
      return next;
    });
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      followedSymbols,
      favoriteSymbols,
      unfollow,
      ensureFollowed,
      toggleFavorite,
      hydrated,
    }),
    [ensureFollowed, favoriteSymbols, followedSymbols, hydrated, toggleFavorite, unfollow],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) {
    throw new Error("useWatchlist must be used within WatchlistProvider");
  }
  return ctx;
}
