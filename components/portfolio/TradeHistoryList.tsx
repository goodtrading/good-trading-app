import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  formatQuantity,
  formatSignedUsd,
  formatUsd,
  signedValueColor,
} from "@/lib/portfolio/accounts/format";
import type { TradeHistoryRow } from "@/lib/portfolio/history/tradeHistoryFromLedger";

type TradeHistoryListProps = {
  rows: TradeHistoryRow[];
};

const ACTION_COLORS: Record<TradeHistoryRow["action"], string> = {
  OPEN: "#3B82F6",
  CLOSE: "#22C55E",
  LIQUIDATION: "#EF4444",
};

/**
 * Recent ledger fills — data must come from engine/ledger trades only.
 */
export const TradeHistoryList = memo(function TradeHistoryList({
  rows,
}: TradeHistoryListProps) {
  const colors = useColors();

  if (rows.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>Historial reciente</Text>
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          Sin operaciones ejecutadas
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>Historial reciente</Text>
      {rows.map((row) => {
        const sideColor = row.direction === "LONG" ? colors.success : colors.primary;
        const actionColor = ACTION_COLORS[row.action];

        return (
          <View
            key={row.id}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.headerRow}>
              <View style={[styles.badge, { backgroundColor: sideColor }]}>
                <Text style={styles.badgeText}>{row.direction}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: actionColor }]}>
                <Text style={styles.badgeText}>{row.action}</Text>
              </View>
              {row.triggerReason ? (
                <View style={[styles.badge, { backgroundColor: "#6366F1" }]}>
                  <Text style={styles.badgeText}>{row.triggerReason.replace("_", " ")}</Text>
                </View>
              ) : null}
              <Text style={[styles.symbol, { color: colors.foreground }]} numberOfLines={1}>
                {row.symbol}
              </Text>
            </View>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>
              {formatQuantity(row.quantity, 4)} @ {formatUsd(row.price)}
            </Text>
            <View style={styles.footerRow}>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {new Date(row.timestamp).toLocaleString("es-ES")}
              </Text>
              {row.realizedPnL != null ? (
                <Text
                  style={[
                    styles.pnl,
                    { color: signedValueColor(row.realizedPnL, colors) },
                  ]}
                >
                  {formatSignedUsd(row.realizedPnL)}
                </Text>
              ) : (
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>—</Text>
              )}
            </View>
          </View>
        );
      })}
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
    gap: 6,
    flexWrap: "wrap",
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
    letterSpacing: 0.3,
  },
  symbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  detail: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  meta: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  pnl: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
