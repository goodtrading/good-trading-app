import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { portfolioSummary, mockPrices, type Position } from "@/data/mockData";

type Currency = "USD" | "BTC" | "ETH" | "USDT";

const CURRENCY_OPTIONS: Currency[] = ["USD", "BTC", "ETH", "USDT"];

const GROUP_LABELS: Record<Position["type"], string> = {
  spot: "SPOT",
  futures: "FUTUROS",
  usdt: "USDT",
};

const GROUP_ORDER: Position["type"][] = ["spot", "futures", "usdt"];

const maskValue = (text: string, hidden: boolean) => (hidden ? "••••••" : text);

const formatUsd = (value: number, decimals = 2) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const convertFromUsd = (usdValue: number, currency: Currency) => {
  if (currency === "USD") return usdValue;
  return usdValue / mockPrices[currency];
};

const formatCurrencyAmount = (usdValue: number, currency: Currency) => {
  const converted = convertFromUsd(usdValue, currency);

  if (currency === "USD") {
    return formatUsd(converted);
  }

  if (currency === "USDT") {
    return `${converted.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }

  if (currency === "BTC") {
    return `${converted.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    })} BTC`;
  }

  return `${converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })} ETH`;
};

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

const formatPnlInCurrency = (usdValue: number, currency: Currency) => {
  const sign = usdValue > 0 ? "+" : usdValue < 0 ? "-" : "";
  const absFormatted = formatCurrencyAmount(Math.abs(usdValue), currency);
  return `${sign}${absFormatted}`;
};

const formatPnlPercent = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

function PositionRow({
  position,
  balancesHidden,
}: {
  position: Position;
  balancesHidden: boolean;
}) {
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
            {maskValue(formatUsd(position.valueUSD), balancesHidden)}
          </Text>
        </View>
      </View>

      <View style={[styles.positionBottomRow, { borderTopColor: colors.border }]}>
        <View style={styles.quantitySection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CANTIDAD</Text>
          <Text style={[styles.metaValue, { color: colors.secondaryForeground }]}>
            {maskValue(formatQuantity(position), balancesHidden)}
          </Text>
        </View>

        <View style={styles.pnlSection}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>PnL</Text>
          <View style={styles.pnlRow}>
            {!balancesHidden && position.pnl !== 0 && (
              <Feather
                name={isPositive ? "arrow-up-right" : "arrow-down-right"}
                size={11}
                color={pnlColor}
              />
            )}
            <Text style={[styles.pnlValue, { color: pnlColor }]}>
              {maskValue(formatPnl(position.pnl), balancesHidden)}
            </Text>
            <Text style={[styles.pnlPercent, { color: pnlColor }]}>
              ({maskValue(formatPnlPercent(position.pnlPercent), balancesHidden)})
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

  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("USD");
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);

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

  const convertedTotal = formatCurrencyAmount(totalValueUSD, selectedCurrency);
  const convertedTodayPnl = formatPnlInCurrency(todayPnl, selectedCurrency);

  const handleSelectCurrency = (currency: Currency) => {
    setSelectedCurrency(currency);
    setCurrencyMenuOpen(false);
  };

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
        <View style={styles.headerTopRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            VALOR TOTAL EST.
          </Text>
          <Pressable
            onPress={() => setBalancesHidden((prev) => !prev)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={balancesHidden ? "Mostrar balances" : "Ocultar balances"}
          >
            <Feather
              name={balancesHidden ? "eye-off" : "eye"}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>

        <View style={styles.currencyRow}>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {maskValue(convertedTotal, balancesHidden)}
          </Text>

          <View style={styles.currencySelectorWrap}>
            <Pressable
              onPress={() => setCurrencyMenuOpen((prev) => !prev)}
              style={[styles.currencySelector, { borderColor: colors.border, backgroundColor: colors.secondary }]}
              accessibilityRole="button"
              accessibilityLabel="Seleccionar moneda"
            >
              <Text style={[styles.currencySelectorText, { color: colors.foreground }]}>
                {selectedCurrency}
              </Text>
              <Feather
                name={currencyMenuOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.mutedForeground}
              />
            </Pressable>

            {currencyMenuOpen && (
              <View style={[styles.currencyMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {CURRENCY_OPTIONS.map((currency) => (
                  <Pressable
                    key={currency}
                    onPress={() => handleSelectCurrency(currency)}
                    style={[
                      styles.currencyOption,
                      selectedCurrency === currency && { backgroundColor: colors.secondary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.currencyOptionText,
                        {
                          color:
                            selectedCurrency === currency
                              ? colors.foreground
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      {currency}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {selectedCurrency !== "USD" && (
          <Text style={[styles.usdEquivalent, { color: colors.mutedForeground }]}>
            = {maskValue(formatUsd(totalValueUSD), balancesHidden)}
          </Text>
        )}

        <View style={[styles.todayRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.todayLabel, { color: colors.mutedForeground }]}>PnL DE HOY</Text>
          <View style={styles.todayPnlRow}>
            {!balancesHidden && todayPnl !== 0 && (
              <Feather
                name={isTodayPositive ? "arrow-up-right" : "arrow-down-right"}
                size={12}
                color={todayColor}
              />
            )}
            <Text style={[styles.todayPnl, { color: todayColor }]}>
              {maskValue(convertedTodayPnl, balancesHidden)}
            </Text>
            <Text style={[styles.todayPnlPercent, { color: todayColor }]}>
              ({maskValue(formatPnlPercent(todayPnlPercent), balancesHidden)})
            </Text>
          </View>
        </View>
      </View>

      {currencyMenuOpen && (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setCurrencyMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar selector de moneda"
        />
      )}

      {groupedPositions.map((group) => (
        <View key={group.type} style={styles.groupSection}>
          <View style={[styles.groupHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.groupTitle, { color: colors.foreground }]}>{group.label}</Text>
            <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
              {group.items.length} {group.items.length === 1 ? "posición" : "posiciones"}
            </Text>
          </View>

          {group.items.map((position) => (
            <PositionRow
              key={`${position.type}-${position.symbol}`}
              position={position}
              balancesHidden={balancesHidden}
            />
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
    zIndex: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  currencyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  summaryValue: {
    flex: 1,
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  currencySelectorWrap: {
    position: "relative",
    zIndex: 10,
  },
  currencySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  currencySelectorText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  currencyMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    minWidth: 88,
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  currencyOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  currencyOptionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  usdEquivalent: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 6,
    letterSpacing: 0.2,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
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
