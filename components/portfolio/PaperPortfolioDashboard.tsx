import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { usePortfolioEngine } from "@/lib/portfolio/usePortfolioEngine";

type Props = {
  marketPrice: number;
};

const formatUsd = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const formatPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

function MetricRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function PaperPortfolioDashboard({ marketPrice }: Props) {
  const colors = useColors();
  const { state, isLoading, error } = usePortfolioEngine(marketPrice);

  if (isLoading) {
    return (
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !state) {
    return (
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.primary }}>{error ?? "Portfolio engine unavailable"}</Text>
      </View>
    );
  }

  const btc = state.positions.find((position) => position.symbol === PORTFOLIO_V1_SYMBOL);

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Paper Portfolio Engine</Text>
      <MetricRow label="Portfolio Value" value={formatUsd(state.portfolio.equity)} />
      <MetricRow label="Cash" value={formatUsd(state.portfolio.cashBalance)} />
      <MetricRow label="BTC Holdings" value={btc ? String(btc.quantity) : "0"} />
      <MetricRow label="Average Entry" value={btc ? formatUsd(btc.avgEntry) : "—"} />
      <MetricRow label="Current Price" value={formatUsd(marketPrice)} />
      <MetricRow label="Unrealized PnL" value={formatUsd(state.portfolio.unrealizedPnL)} />
      <MetricRow label="Realized PnL" value={formatUsd(state.portfolio.realizedPnL)} />
      <MetricRow label="Total Return %" value={formatPct(state.portfolio.totalReturnPercent)} />
      <MetricRow label="Trades Count" value={String(state.trades.length)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  title: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  value: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
