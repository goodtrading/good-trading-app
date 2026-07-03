import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { useColors } from "@/hooks/useColors";
import { formatQuantity, formatSignedUsd, formatUsd } from "@/lib/portfolio/accounts/format";
import { getSourceMeta } from "@/lib/portfolio";
import type { PortfolioPosition } from "@/lib/portfolio/types";

type WalletExchangeScreenProps = {
  sourceId: "binance" | "bingx";
};

function cashFromPositions(positions: PortfolioPosition[]): number {
  return positions
    .filter((position) => position.type === "usdt")
    .reduce((sum, position) => sum + position.valueUSD, 0);
}

export function WalletExchangeScreen({ sourceId }: WalletExchangeScreenProps) {
  const colors = useColors();
  const { snapshot, isLoading, error } = usePortfolioSnapshot();
  const [balancesHidden, setBalancesHidden] = useState(false);
  const sourceMeta = getSourceMeta(sourceId);

  const mask = (value: string) => (balancesHidden ? "••••••" : value);

  const positions = snapshot?.positions ?? [];
  const openPositions = useMemo(
    () => positions.filter((position) => position.type !== "usdt"),
    [positions],
  );
  const cashAvailable = cashFromPositions(positions);
  const totalValueUSD = snapshot?.balance.totalValueUSD ?? 0;
  const todayPnl = snapshot?.balance.todayPnl ?? 0;
  const todayPnlPercent = snapshot?.balance.todayPnlPercent ?? 0;
  const todayColor =
    todayPnl > 0 ? colors.success : todayPnl < 0 ? colors.primary : colors.mutedForeground;

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Cargando {sourceMeta.name}…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorCard, { borderColor: colors.primary }]}>
        <Text style={[styles.errorText, { color: colors.primary }]}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.summaryCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.summaryTop}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Valor total estimado</Text>
          <Pressable
            onPress={() => setBalancesHidden((prev) => !prev)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={balancesHidden ? "Mostrar balances" : "Ocultar balances"}
          >
            <Feather
              name={balancesHidden ? "eye-off" : "eye"}
              size={12}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          {mask(formatUsd(totalValueUSD))}
        </Text>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Cash disponible</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>
            {mask(formatUsd(cashAvailable))}
          </Text>
        </View>

        <View style={styles.metricRow}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>PnL de hoy</Text>
          <Text style={[styles.metricValue, { color: todayColor }]}>
            {mask(`${formatSignedUsd(todayPnl)} (${todayPnlPercent.toFixed(2)}%)`)}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Posiciones abiertas</Text>
      {openPositions.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No hay posiciones abiertas.
          </Text>
        </View>
      ) : (
        openPositions.map((position) => (
          <View
            key={`${position.symbol}-${position.type}-${position.name}`}
            style={[styles.positionRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={styles.positionLeft}>
              <Text style={[styles.positionSymbol, { color: colors.foreground }]}>
                {position.symbol}
                {position.type === "futures" ? " · Futures" : " · Spot"}
              </Text>
              <Text style={[styles.positionMeta, { color: colors.mutedForeground }]}>
                {mask(`${formatQuantity(position.quantity)} @ ${formatUsd(position.entryPrice)}`)}
              </Text>
            </View>
            <View style={styles.positionRight}>
              <Text style={[styles.positionValue, { color: colors.foreground }]}>
                {mask(formatUsd(position.valueUSD))}
              </Text>
              <Text
                style={[
                  styles.positionPnl,
                  { color: position.pnl >= 0 ? colors.success : colors.primary },
                ]}
              >
                {mask(formatSignedUsd(position.pnl))}
              </Text>
            </View>
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Historial</Text>
      <View style={[styles.emptyState, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          El historial operativo se conectará con {sourceMeta.name}.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginBottom: 12,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  summaryValue: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  metricValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  sectionTitle: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  positionRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  positionLeft: {
    flex: 1,
    gap: 2,
  },
  positionSymbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  positionMeta: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  positionRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  positionValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  positionPnl: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
});
