import { useRouter, type Href } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { WatchlistItem } from "@/components/WatchlistItem";
import { WatchlistContextMenuSheet } from "@/components/watchlist/WatchlistContextMenuSheet";
import { WatchlistEmptyState } from "@/components/watchlist/WatchlistEmptyState";
import { WatchlistSearchSheet } from "@/components/watchlist/WatchlistSearchSheet";
import { useWatchlistMarketQuotes } from "@/hooks/useWatchlistMarketQuotes";
import { useColors } from "@/hooks/useColors";
import {
  getTabScrollViewStyle,
  TAB_SCROLL_VIEW_PROPS,
  useTabScreenScrollInsets,
} from "@/hooks/useTabScreenScrollInsets";
import { useActiveAsset } from "@/lib/assets";
import { canSelectAsset } from "@/lib/assets/assetCatalog";
import type { TradingAsset, WatchlistAsset } from "@/lib/assets/types";
import {
  buildWatchlistAssets,
  buildWatchlistAuditTable,
  getContextMenuOptions,
  isFavoriteSymbol,
  sortWatchlistAssets,
  toWatchlistAssetViewModel,
  useWatchlist,
} from "@/lib/watchlist";
import type { WatchlistAction } from "@/lib/watchlist/watchlistModel";
import type { WatchlistMarketQuote } from "@/lib/watchlist/resolveWatchlistQuote";
import type { WatchlistAssetViewModel } from "@/lib/watchlist/formatters";

function logWatchlistAudit(btcQuote: WatchlistMarketQuote | undefined) {
  if (!__DEV__) return;
  console.log("[WATCHLIST AUDIT]", buildWatchlistAuditTable(btcQuote));
}

function logWatchlistItem(asset: WatchlistAsset, viewModel: WatchlistAssetViewModel) {
  if (!__DEV__) return;
  console.log("[WATCHLIST ITEM]", {
    symbol: asset.symbol,
    price: viewModel.price,
    change: viewModel.change,
    gammaRegime: viewModel.gammaRegime,
    localFlip: viewModel.localFlip,
    flipDistance: viewModel.flipDistance,
    status: asset.status,
  });
}

function logWatchlistDistance(asset: WatchlistAsset) {
  if (!__DEV__) return;
  if (asset.price == null || asset.gammaFlip == null) return;
  console.log("[WATCHLIST DISTANCE]", {
    symbol: asset.symbol,
    spot: asset.price,
    flip: asset.gammaFlip,
    distancePct: asset.flipDistancePct,
  });
}

function logWatchlistMenu(action: WatchlistAction, symbol: string) {
  if (!__DEV__) return;
  console.log("[WATCHLIST MENU]", { action, symbol });
}

export default function WatchlistScreen() {
  const colors = useColors();
  const router = useRouter();
  const { bottomPad, contentPaddingTop } = useTabScreenScrollInsets();
  const { activeAsset, setActiveAsset, catalog } = useActiveAsset();
  const { followedSymbols, favoriteSymbols, ensureFollowed, toggleFavorite } = useWatchlist();
  const quotes = useWatchlistMarketQuotes(followedSymbols);

  const [searchOpen, setSearchOpen] = useState(false);
  const [menuSymbol, setMenuSymbol] = useState<TradingAsset | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const visibleAssets = useMemo(() => {
    const assets = buildWatchlistAssets({ followedSymbols, quotes });
    return sortWatchlistAssets(assets, activeAsset);
  }, [activeAsset, followedSymbols, quotes]);

  useEffect(() => {
    logWatchlistAudit(quotes.BTC);
  }, [quotes.BTC]);

  useEffect(() => {
    if (!__DEV__) return;
    visibleAssets.forEach((asset) => {
      logWatchlistDistance(asset);
      logWatchlistItem(
        asset,
        toWatchlistAssetViewModel(
          asset,
          asset.symbol === activeAsset,
          isFavoriteSymbol(favoriteSymbols, asset.symbol),
        ),
      );
    });
  }, [activeAsset, favoriteSymbols, visibleAssets]);

  useEffect(() => {
    if (!blockedMessage) return;
    const timer = setTimeout(() => setBlockedMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [blockedMessage]);

  const menuAsset = visibleAssets.find((asset) => asset.symbol === menuSymbol) ?? null;
  const menuActions = menuAsset ? getContextMenuOptions(menuAsset.status) : [];

  const navigateHome = () => {
    router.push("/(tabs)/index" as Href);
  };

  const navigatePortfolio = () => {
    router.push("/(tabs)/learn" as Href);
  };

  const handleSelectAsset = (symbol: string) => {
    if (!canSelectAsset(symbol)) {
      setBlockedMessage("Próximamente");
      return;
    }
    setActiveAsset(symbol);
    ensureFollowed(symbol);
  };

  const handleMenuAction = (action: WatchlistAction, symbol: TradingAsset) => {
    logWatchlistMenu(action, symbol);

    switch (action) {
      case "view_analysis":
      case "go_home":
        if (canSelectAsset(symbol)) {
          setActiveAsset(symbol);
        }
        navigateHome();
        break;
      case "go_portfolio":
        navigatePortfolio();
        break;
      case "create_alert":
        setBlockedMessage("Próximamente");
        break;
      case "unfollow":
        setBlockedMessage("Próximamente");
        break;
      case "coming_soon":
        setBlockedMessage("Próximamente");
        break;
      default:
        break;
    }
  };

  const openMenu = (symbol: TradingAsset) => {
    setMenuSymbol(symbol);
    if (__DEV__) {
      console.log("[WATCHLIST MENU]", { event: "open", symbol });
    }
  };

  return (
    <>
      <ScrollView
        style={getTabScrollViewStyle(colors.background)}
        contentContainerStyle={{
          paddingTop: contentPaddingTop,
          paddingBottom: bottomPad,
          paddingHorizontal: 16,
        }}
        {...TAB_SCROLL_VIEW_PROPS}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>WatchList</Text>
          <Pressable
            onPress={() => setSearchOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Buscar activos"
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="search" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {blockedMessage ? (
          <View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.toastText, { color: colors.mutedForeground }]}>{blockedMessage}</Text>
          </View>
        ) : null}

        {visibleAssets.length === 0 ? (
          <WatchlistEmptyState onAddAsset={() => setSearchOpen(true)} />
        ) : (
          visibleAssets.map((asset) => {
            const isFavorite = isFavoriteSymbol(favoriteSymbols, asset.symbol);
            const viewModel = toWatchlistAssetViewModel(
              asset,
              asset.symbol === activeAsset,
              isFavorite,
            );
            return (
              <WatchlistItem
                key={asset.symbol}
                {...viewModel}
                onPress={() => openMenu(asset.symbol as TradingAsset)}
                onToggleFavorite={() => toggleFavorite(asset.symbol as TradingAsset)}
              />
            );
          })
        )}
      </ScrollView>

      <WatchlistSearchSheet
        visible={searchOpen}
        catalog={catalog}
        activeAsset={activeAsset}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectAsset}
        onBlocked={(message) => setBlockedMessage(message)}
      />

      <WatchlistContextMenuSheet
        visible={menuSymbol != null}
        symbol={menuSymbol ?? ""}
        actions={menuActions}
        onClose={() => setMenuSymbol(null)}
        onAction={(action) => {
          if (!menuSymbol) return;
          handleMenuAction(action, menuSymbol);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  toastText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
});
