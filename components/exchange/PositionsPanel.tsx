import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { formatUsd } from "@/lib/portfolio/accounts/format";
import type { Position } from "@/lib/portfolio/types";

/**
 * Experimental positions panel (Exchange lab).
 * Same engine positions as Classic; UI patterns may later feed Classic.
 */
type PositionsPanelProps = {
  positions: Position[];
  leverage: number;
  marketPrice: number | null;
};

export function PositionsPanel({ positions, leverage, marketPrice }: PositionsPanelProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Positions</Text>

      {positions.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Sin posiciones abiertas</Text>
      ) : (
        positions.map((position) => {
          const side = position.quantity >= 0 ? "LONG" : "SHORT";
          const pnlColor =
            position.unrealizedPnL > 0
              ? colors.success
              : position.unrealizedPnL < 0
                ? colors.primary
                : colors.mutedForeground;
          const liqPrice = position.liquidationPrice;

          return (
            <View
              key={position.symbol}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <View style={styles.left}>
                <Text style={[styles.symbol, { color: colors.foreground }]}>
                  {position.symbol} · {side}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  Qty {Math.abs(position.quantity).toFixed(4)} · Entry {formatUsd(position.avgEntry)}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  Mark {formatUsd(marketPrice ?? position.marketPrice)} · {leverage}x
                </Text>
                {liqPrice != null ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    Liq {formatUsd(liqPrice)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.pnl, { color: pnlColor }]}>
                {position.unrealizedPnL >= 0 ? "+" : ""}
                {formatUsd(position.unrealizedPnL)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  empty: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 10,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  symbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  meta: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  pnl: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
