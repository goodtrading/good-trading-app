import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/portfolio/accounts/format";
import type { OrderBookState } from "@/lib/portfolio/runtime/PortfolioEngineRuntime";

/**
 * Experimental order book (Exchange lab).
 * Read-only view of MatchingEngine open LIMIT orders via runtime.
 * Kept for future advanced Classic tooling — not production Trading UX.
 */
type OrderBookProps = {
  orderBook: OrderBookState;
  marketPrice: number | null;
};

function formatPrice(value: number): string {
  return formatMoney(value);
}

function formatQty(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function OrderBook({ orderBook, marketPrice }: OrderBookProps) {
  const colors = useColors();

  const maxQty = useMemo(() => {
    const levels = [...orderBook.bids, ...orderBook.asks];
    return levels.reduce((max, level) => Math.max(max, level.quantity), 0) || 1;
  }, [orderBook.asks, orderBook.bids]);

  const asks = orderBook.asks.slice(0, 8).reverse();
  const bids = orderBook.bids.slice(0, 8);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Order Book</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {marketPrice != null ? `Mark ${formatPrice(marketPrice)}` : "Sin precio"}
        </Text>
      </View>

      <View style={styles.columns}>
        <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Price</Text>
        <Text style={[styles.colLabel, { color: colors.mutedForeground }]}>Size</Text>
      </View>

      {asks.map((level) => (
        <View key={`ask-${level.price}`} style={styles.row}>
          <View
            style={[
              styles.depth,
              styles.depthAsk,
              {
                width: `${(level.quantity / maxQty) * 100}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
          <Text
            style={[
              styles.price,
              {
                color: colors.primary,
                fontFamily:
                  level.price === orderBook.bestAsk ? "Inter_700Bold" : "Inter_500Medium",
              },
            ]}
          >
            {formatPrice(level.price)}
          </Text>
          <Text style={[styles.qty, { color: colors.foreground }]}>{formatQty(level.quantity)}</Text>
        </View>
      ))}

      <View style={[styles.spreadRow, { borderColor: colors.border }]}>
        <Text style={[styles.spread, { color: colors.mutedForeground }]}>
          {orderBook.bestBid != null && orderBook.bestAsk != null
            ? `Spread ${(orderBook.bestAsk - orderBook.bestBid).toFixed(2)}`
            : "Sin profundidad LIMIT"}
        </Text>
      </View>

      {bids.map((level) => (
        <View key={`bid-${level.price}`} style={styles.row}>
          <View
            style={[
              styles.depth,
              styles.depthBid,
              {
                width: `${(level.quantity / maxQty) * 100}%`,
                backgroundColor: colors.success,
              },
            ]}
          />
          <Text
            style={[
              styles.price,
              {
                color: colors.success,
                fontFamily:
                  level.price === orderBook.bestBid ? "Inter_700Bold" : "Inter_500Medium",
              },
            ]}
          >
            {formatPrice(level.price)}
          </Text>
          <Text style={[styles.qty, { color: colors.foreground }]}>{formatQty(level.quantity)}</Text>
        </View>
      ))}

      {asks.length === 0 && bids.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          No hay órdenes LIMIT abiertas
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  meta: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  colLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    overflow: "hidden",
  },
  depth: {
    position: "absolute",
    top: 0,
    bottom: 0,
    opacity: 0.12,
  },
  depthAsk: {
    right: 0,
  },
  depthBid: {
    left: 0,
  },
  price: {
    fontSize: 12,
    zIndex: 1,
  },
  qty: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    zIndex: 1,
  },
  spreadRow: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 6,
    marginVertical: 4,
    alignItems: "center",
  },
  spread: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingVertical: 10,
  },
});
