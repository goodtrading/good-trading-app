import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { DonutChart } from "@/components/portfolio/DonutChart";
import { EditorialSectionTitle } from "@/components/EditorialSectionTitle";
import { useColors } from "@/hooks/useColors";
import { usePortfolioReadContext } from "@/lib/cartera";
import { formatQuantity, formatUsd } from "@/lib/portfolio/accounts/format";
import { wealthSliceColor } from "@/lib/cartera";

/**
 * READ-ONLY bounded context renderer — analytics and aggregation.
 */
export function PortfolioContextView() {
  const colors = useColors();
  const { wealth, isLoading, error } = usePortfolioReadContext();
  const [balancesHidden, setBalancesHidden] = useState(false);

  const mask = (value: string) => (balancesHidden ? "••••••" : value);
  const legend = useMemo(() => wealth?.slices ?? [], [wealth?.slices]);
  const isInitialLoading = wealth === null && isLoading;

  if (isInitialLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Consolidando patrimonio…
        </Text>
      </View>
    );
  }

  if (wealth === null && error) {
    return (
      <View style={[styles.errorCard, { borderColor: colors.primary }]}>
        <Text style={[styles.errorText, { color: colors.primary }]}>{error}</Text>
      </View>
    );
  }

  if (wealth === null || wealth.totalValueUSD <= 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Portfolio</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Consolidado global (solo lectura)</Text>
        </View>
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sin patrimonio consolidado</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {error ?? "Agrega cuentas en Trading para ver la distribución global aquí."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Portfolio</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Consolidado global (solo lectura)</Text>
      </View>

      <View style={styles.heroHeader}>
        <View>
          <Text style={[styles.heroLabel, { color: colors.mutedForeground }]}>Patrimonio total</Text>
          <Text style={[styles.heroValue, { color: colors.foreground }]}>
            {mask(formatUsd(wealth.totalValueUSD))}
          </Text>
        </View>
        <Pressable
          onPress={() => setBalancesHidden((prev) => !prev)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={balancesHidden ? "Mostrar balances" : "Ocultar balances"}
        >
          <Feather
            name={balancesHidden ? "eye-off" : "eye"}
            size={14}
            color={colors.mutedForeground}
          />
        </Pressable>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <EditorialSectionTitle>Distribución</EditorialSectionTitle>
        <DonutChart slices={legend} />
        <View style={styles.legend}>
          {legend.map((slice) => (
            <View key={slice.symbol} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: wealthSliceColor(slice.symbol) }]} />
              <Text style={[styles.legendSymbol, { color: colors.foreground }]}>
                {slice.symbol === "OTHER" ? "Otros" : slice.symbol}
              </Text>
              <Text style={[styles.legendPercent, { color: colors.mutedForeground }]}>
                {mask(`${slice.percent.toFixed(0)}%`)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <EditorialSectionTitle>Activos</EditorialSectionTitle>
        {wealth.slices.map((slice) => (
          <View
            key={slice.symbol}
            style={[styles.assetRow, { borderBottomColor: colors.border }]}
          >
            <View style={styles.assetLeft}>
              <Text style={[styles.assetSymbol, { color: colors.foreground }]}>
                {slice.symbol === "OTHER" ? "Otros" : slice.symbol}
              </Text>
              <Text style={[styles.assetQty, { color: colors.mutedForeground }]}>
                {mask(formatQuantity(slice.quantity))}
              </Text>
            </View>
            <View style={styles.assetRight}>
              <Text style={[styles.assetValue, { color: colors.foreground }]}>
                {mask(formatUsd(slice.valueUSD))}
              </Text>
              <Text style={[styles.assetPercent, { color: colors.mutedForeground }]}>
                {mask(`${slice.percent.toFixed(1)}%`)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <EditorialSectionTitle>Rendimiento</EditorialSectionTitle>
        <View style={styles.performanceGrid}>
          {wealth.performance.map((metric) => {
            const positive = metric.percent > 0;
            const negative = metric.percent < 0;
            const tone = positive ? colors.success : negative ? colors.primary : colors.mutedForeground;

            return (
              <View key={metric.window} style={[styles.performanceCell, { borderColor: colors.border }]}>
                <Text style={[styles.performanceWindow, { color: colors.mutedForeground }]}>
                  {metric.window}
                </Text>
                <Text style={[styles.performanceValue, { color: tone }]}>
                  {mask(`${metric.percent > 0 ? "+" : ""}${metric.percent.toFixed(2)}%`)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    marginBottom: 12,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  container: {
    gap: 14,
    marginBottom: 12,
  },
  loadingWrap: {
    paddingVertical: 32,
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
  emptyCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  emptyBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  heroValue: {
    marginTop: 4,
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  section: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  legend: {
    gap: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendSymbol: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  legendPercent: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  assetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  assetLeft: {
    gap: 2,
  },
  assetSymbol: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  assetQty: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  assetRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  assetValue: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  assetPercent: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  performanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  performanceCell: {
    width: "47%",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  performanceWindow: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
  },
  performanceValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
