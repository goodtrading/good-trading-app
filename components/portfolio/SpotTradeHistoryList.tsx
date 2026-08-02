import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { formatQuantity, formatUsd } from "@/lib/portfolio/accounts/format";
import type { SpotTrade } from "@/lib/portfolio/spot/types";

type SpotTradeHistoryListProps = {
  trades: SpotTrade[];
};

/**
 * SPOT trade history — reads SpotTrade[] from SpotLedger only.
 */
export const SpotTradeHistoryList = memo(function SpotTradeHistoryList({
  trades,
}: SpotTradeHistoryListProps) {
  const colors = useColors();
  const rows = [...trades].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>Historial reciente</Text>
      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Sin operaciones ejecutadas
        </Text>
      ) : (
        rows.map((trade) => {
          const sideColor = trade.side === "BUY" ? colors.success : colors.primary;
          return (
            <View
              key={trade.id}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.headerRow}>
                <View style={[styles.badge, { backgroundColor: sideColor }]}>
                  <Text style={styles.badgeText}>{trade.side}</Text>
                </View>
                <Text style={[styles.pair, { color: colors.foreground }]}>
                  {trade.baseAsset}/{trade.quoteAsset}
                </Text>
              </View>
              <Text style={[styles.detail, { color: colors.mutedForeground }]}>
                {formatQuantity(trade.quantity, 6)} @ {formatUsd(trade.price)}
              </Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {new Date(trade.timestamp).toLocaleString("es-ES")} ·{" "}
                {formatUsd(trade.quoteQuantity)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  empty: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  pair: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  detail: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  meta: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
});
