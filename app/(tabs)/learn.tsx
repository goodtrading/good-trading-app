import React from "react";
import { ScrollView, View, Text, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { portfolioSummary, type Position } from "@/data/mockData";

const GROUP_LABELS: Record<Position["type"], string> = {
  spot: "SPOT",
  futures: "FUTUROS",
  usdt: "USDT",
};

const GROUP_ORDER: Position["type"][] = ["spot", "futures", "usdt"];

const formatUsd = (value: number, decimals = 2) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const formatQuantity = (position: Position) => {
  if (position.type === "usdt") {
    return position.quantity.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return position.quantity.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};

const formatPnl = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value))}`;
};

const formatPnlPercent = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

function PositionRow({ position }: { position: Position }) {
  const colors = useColors();
  const isPositive = position.pnl > 0;
  const isNegative = position.pnl < 0;
  const pnlColor = isPositive ? colors.success : isNegative ? colors.primary : colors.mutedForeground;

  return (
    <View style={[styles.positionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.positionTopRow}>
        <View style={styles.symbolSection}>
          <Text style={[styles.symbol, { color: colors.foreground }]}>{position.symbol}</Text>
          <Text style={[styles.name, { color: colors.mutedForeground }]}>{position.name}</Text>
        </View>

        <View style={styles.valueSection}>
          <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>VALOR</Text>
          <Text style={[styles.valueAmount, { color: colors.foreground }]}>
            {formatUsd(position.valueUSD)}
          </Text>
        </View>
      </View>

      <View style={[styles.positionBottomRow, { borderTopColor: colors.border }]}>
        <View style={styles.quantitySection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CANTIDAD</Text>
          <Text style={[styles.metaValue, { color: colors.secondaryForeground }]}>
            {formatQuantity(position)}
          </Text>
        </View>

        <View style={styles.pnlSection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>PnL</Text>
          <View style={styles.pnlRow}>
            {position.pnl !== 0 && (
              <Feather
                name={isPositive ? "arrow-up-right" : "arrow-down-right"}
                size={11}
                color={pnlColor}
              />
            )}
            <Text style={[styles.pnlValue, { color: pnlColor }]}>{formatPnl(position.pnl)}</Text>
            <Text style={[styles.pnlPercent, { color: pnlColor }]}>
              ({formatPnlPercent(position.pnlPercent)})
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function LearnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { totalValueUSD, todayPnl, todayPnlPercent, positions } = portfolioSummary;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const isTodayPositive = todayPnl > 0;
  const isTodayNegative = todayPnl < 0;
  const todayColor = isTodayPositive
    ? colors.success
    : isTodayNegative
      ? colors.primary
      : colors.mutedForeground;

  const groupedPositions = GROUP_ORDER.map((type) => ({
    type,
    label: GROUP_LABELS[type],
    items: positions.filter((position) => position.type === type),
  })).filter((group) => group.items.length > 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
          VALOR TOTAL ESTIMADO
        </Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>
          {formatUsd(totalValueUSD, 2)}
        </Text>
        <View style={[styles.todayRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.todayLabel, { color: colors.mutedForeground }]}>HOY</Text>
          <View style={styles.todayPnlRow}>
            {todayPnl !== 0 && (
              <Feather
                name={isTodayPositive ? "arrow-up-right" : "arrow-down-right"}
                size={12}
                color={todayColor}
              />
            )}
            <Text style={[styles.todayPnl, { color: todayColor }]}>{formatPnl(todayPnl)}</Text>
            <Text style={[styles.todayPnlPercent, { color: todayColor }]}>
              ({formatPnlPercent(todayPnlPercent)})
            </Text>
          </View>
        </View>
      </View>

      {groupedPositions.map((group) => (
        <View key={group.type} style={styles.groupSection}>
          <View style={[styles.groupHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.groupTitle, { color: colors.foreground }]}>{group.label}</Text>
            <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
              {group.items.length} {group.items.length === 1 ? "posición" : "posiciones"}
            </Text>
          </View>

          {group.items.map((position) => (
            <PositionRow key={`${position.type}-${position.symbol}`} position={position} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    borderRadius: 4,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  todayLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  todayPnlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  todayPnl: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  todayPnlPercent: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  groupSection: {
    marginBottom: 18,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  groupTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  groupCount: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  positionCard: {
    borderRadius: 4,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  positionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  symbolSection: {
    flex: 1,
  },
  symbol: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  valueSection: {
    alignItems: "flex-end",
  },
  valueLabel: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  valueAmount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  positionBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  quantitySection: {
    flex: 1,
  },
  pnlSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  metaLabel: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  pnlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  pnlValue: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  pnlPercent: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
