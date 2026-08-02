import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { OrderBook } from "@/components/exchange/OrderBook";
import { OrderPanel } from "@/components/exchange/OrderPanel";
import { PositionsPanel } from "@/components/exchange/PositionsPanel";
import { useColors } from "@/hooks/useColors";
import {
  portfolioEngineRuntime,
  type RuntimeUiSnapshot,
} from "@/lib/portfolio/runtime/PortfolioEngineRuntime";

type ExchangeTradingViewProps = {
  btcPrice: number | null;
  isLive: boolean;
  isPriceLoading: boolean;
};

const EMPTY_SNAPSHOT: RuntimeUiSnapshot = {
  accountId: null,
  marketPrice: null,
  leverage: 1,
  positionMode: "LONG_ONLY",
  state: null,
  positions: [],
  openOrders: [],
  orderBook: {
    bids: [],
    asks: [],
    bestBid: null,
    bestAsk: null,
    midPrice: null,
    openOrders: [],
  },
};

/**
 * Experimental exchange-style trading surface (UI lab).
 *
 * Production Trading UX is Classic (`WalletScreen` via TradingContextView).
 * This surface is kept as a sandbox for future reuse:
 * - advanced position entry
 * - professional order panel
 * - order book
 * - advanced tools
 *
 * Shares PortfolioEngineRuntime with Classic — does not own engine lifecycle.
 */
export function ExchangeTradingView({
  btcPrice,
  isLive,
  isPriceLoading,
}: ExchangeTradingViewProps) {
  const colors = useColors();
  const [snapshot, setSnapshot] = useState<RuntimeUiSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await portfolioEngineRuntime.getSnapshot();
    setSnapshot(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    portfolioEngineRuntime.updatePrice(btcPrice);
    void refresh();
  }, [btcPrice, refresh]);

  useEffect(() => {
    return portfolioEngineRuntime.subscribe(() => {
      void refresh();
    });
  }, [refresh]);

  const engine = portfolioEngineRuntime.getActiveEngine();

  const handleLeverageChange = (leverage: number) => {
    try {
      engine?.setLeverage(leverage);
      void refresh();
    } catch (error) {
      console.warn("[EXCHANGE LAB LEVERAGE]", error);
    }
  };

  if (loading && snapshot.state == null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Conectando exchange runtime…
        </Text>
      </View>
    );
  }

  if (!engine || !snapshot.accountId) {
    return (
      <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Exchange</Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Selecciona o crea una cuenta Paper para operar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!isLive && btcPrice == null ? (
        <Text style={[styles.banner, { color: colors.primary }]}>
          Precio BTC no disponible. El mark se actualizará cuando el feed esté activo.
        </Text>
      ) : null}
      {isPriceLoading && btcPrice == null ? (
        <View style={styles.loadingInline}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}

      <OrderBook orderBook={snapshot.orderBook} marketPrice={snapshot.marketPrice} />

      <View style={[styles.chartPlaceholder, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.chartTitle, { color: colors.foreground }]}>Chart</Text>
        <Text style={[styles.chartHint, { color: colors.mutedForeground }]}>
          Placeholder — mark {snapshot.marketPrice != null ? snapshot.marketPrice.toFixed(2) : "—"}
        </Text>
      </View>

      <PositionsPanel
        positions={snapshot.positions}
        leverage={snapshot.leverage}
        marketPrice={snapshot.marketPrice}
      />

      <OrderPanel
        engine={engine}
        marketPrice={snapshot.marketPrice}
        positionMode={snapshot.positionMode}
        leverage={snapshot.leverage}
        cashBalance={snapshot.state?.portfolio.cashBalance ?? 0}
        onLeverageChange={handleLeverageChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginBottom: 16,
  },
  loading: {
    paddingVertical: 28,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  loadingInline: {
    alignItems: "flex-start",
  },
  banner: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  chartPlaceholder: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    justifyContent: "center",
    gap: 4,
  },
  chartTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  chartHint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
