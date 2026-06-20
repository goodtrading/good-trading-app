import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddAccountSheet } from "@/components/portfolio/AddAccountSheet";
import { PortfolioScreenHeader } from "@/components/portfolio/PortfolioScreenHeader";
import { useColors } from "@/hooks/useColors";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { getSourceMeta } from "@/lib/portfolio";
import { usePortfolioSource } from "@/lib/portfolio";
import type { PortfolioPosition } from "@/lib/portfolio/types";

type Currency = "USD" | "BTC" | "ETH" | "USDT";
type CategoryId = "divisas" | "indices" | "acciones" | "materias" | "cripto";

const CURRENCY_OPTIONS: Currency[] = ["USD", "BTC", "ETH", "USDT"];
const ALLOCATION_SYMBOLS = ["BTC", "ETH", "USDT"] as const;

const CATEGORY_OPTIONS: { id: CategoryId; label: string }[] = [
  { id: "divisas", label: "Divisas" },
  { id: "indices", label: "Índices" },
  { id: "acciones", label: "Acciones" },
  { id: "materias", label: "Mat. Primas" },
  { id: "cripto", label: "Cripto" },
];

const maskValue = (text: string, hidden: boolean) => (hidden ? "••••••" : text);

const formatUsd = (value: number, decimals = 2) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const getConversionRate = (currency: Currency, positions: PortfolioPosition[]) => {
  if (currency === "USD" || currency === "USDT") return 1;
  const match = positions.find((position) => position.symbol === currency);
  return match?.currentPrice && match.currentPrice > 0 ? match.currentPrice : null;
};

const convertFromUsd = (usdValue: number, currency: Currency, positions: PortfolioPosition[]) => {
  if (currency === "USD") return usdValue;
  const rate = getConversionRate(currency, positions);
  if (!rate) return usdValue;
  return usdValue / rate;
};

const formatCurrencyAmount = (
  usdValue: number,
  currency: Currency,
  positions: PortfolioPosition[],
) => {
  const converted = convertFromUsd(usdValue, currency, positions);

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

const formatPnlInCurrency = (
  usdValue: number,
  currency: Currency,
  positions: PortfolioPosition[],
) => {
  const sign = usdValue > 0 ? "+" : usdValue < 0 ? "-" : "";
  const absFormatted = formatCurrencyAmount(Math.abs(usdValue), currency, positions);
  return `${sign}${absFormatted}`;
};

const formatPnlPercent = (value: number) => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
};

function buildAllocation(
  positions: PortfolioPosition[],
  totalValueUSD: number,
): { symbol: (typeof ALLOCATION_SYMBOLS)[number]; percent: number }[] {
  if (totalValueUSD <= 0) return [];

  return ALLOCATION_SYMBOLS.map((symbol) => {
    const value = positions
      .filter((position) => position.symbol === symbol)
      .reduce((sum, position) => sum + position.valueUSD, 0);
    const percent = (value / totalValueUSD) * 100;
    return { symbol, percent };
  }).filter((item) => item.percent > 0.01);
}

function CategoryBar({
  activeCategory,
  onSelect,
}: {
  activeCategory: CategoryId | null;
  onSelect: (id: CategoryId) => void;
}) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.categoryBarScroll}
      contentContainerStyle={styles.categoryBarContent}
    >
      {CATEGORY_OPTIONS.map((category) => {
        const isActive = activeCategory === category.id;

        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            style={[
              styles.categoryPill,
              {
                backgroundColor: isActive ? colors.primary : colors.secondary,
                borderWidth: isActive ? 1 : 0,
                borderColor: isActive ? colors.primary : "transparent",
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.categoryPillText,
                {
                  color: isActive ? "#ffffff" : colors.secondaryForeground,
                },
              ]}
            >
              {category.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function LearnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedSource } = usePortfolioSource();
  const { snapshot, isLoading, error } = usePortfolioSnapshot();
  const sourceMeta = getSourceMeta(selectedSource);

  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("USD");
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const totalValueUSD = snapshot?.balance.totalValueUSD ?? 0;
  const todayPnl = snapshot?.balance.todayPnl ?? 0;
  const todayPnlPercent = snapshot?.balance.todayPnlPercent ?? 0;
  const positions = snapshot?.positions ?? [];

  const isTodayPositive = todayPnl > 0;
  const isTodayNegative = todayPnl < 0;
  const todayColor = isTodayPositive
    ? colors.success
    : isTodayNegative
      ? colors.primary
      : colors.mutedForeground;

  const allocation = useMemo(
    () => buildAllocation(positions, totalValueUSD),
    [positions, totalValueUSD],
  );

  const convertedTotal = formatCurrencyAmount(totalValueUSD, selectedCurrency, positions);
  const convertedTodayPnl = formatPnlInCurrency(todayPnl, selectedCurrency, positions);

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
      <PortfolioScreenHeader onAddPress={() => setAddAccountOpen(true)} />

      {isLoading ? (
        <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Cargando {sourceMeta.name}…
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorCard, { borderColor: colors.primary, backgroundColor: "#1a0005" }]}>
          <Text style={[styles.errorText, { color: colors.primary }]}>{error}</Text>
        </View>
      ) : null}

      {!isLoading && !error ? (
        <>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.headerTopRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                Valor total est.
              </Text>
              <Pressable
                onPress={() => setBalancesHidden((prev) => !prev)}
                hitSlop={8}
                style={styles.eyeButton}
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

            <View style={styles.valueRow}>
              <Text
                style={[styles.summaryValue, { color: colors.foreground }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {maskValue(convertedTotal, balancesHidden)}
              </Text>

              <View style={styles.currencySelectorWrap}>
                <Pressable
                  onPress={() => setCurrencyMenuOpen((prev) => !prev)}
                  style={[
                    styles.currencySelector,
                    { borderColor: colors.border, backgroundColor: colors.secondary },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Seleccionar moneda"
                >
                  <Text style={[styles.currencySelectorText, { color: colors.foreground }]}>
                    {selectedCurrency}
                  </Text>
                  <Feather
                    name={currencyMenuOpen ? "chevron-up" : "chevron-down"}
                    size={12}
                    color={colors.mutedForeground}
                  />
                </Pressable>

                {currencyMenuOpen ? (
                  <View
                    style={[
                      styles.currencyMenu,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
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
                ) : null}
              </View>
            </View>

            {selectedCurrency !== "USD" ? (
              <Text style={[styles.usdEquivalent, { color: colors.mutedForeground }]}>
                = {maskValue(formatUsd(totalValueUSD), balancesHidden)}
              </Text>
            ) : null}

            <View style={styles.summaryPnlRow}>
              <Text
                style={[
                  styles.summaryPnlLabel,
                  {
                    color: colors.mutedForeground,
                    borderBottomColor: colors.mutedForeground,
                  },
                ]}
              >
                PnL de hoy
              </Text>
              <View style={styles.summaryPnlValues}>
                {!balancesHidden && todayPnl !== 0 ? (
                  <Feather
                    name={isTodayPositive ? "arrow-up-right" : "arrow-down-right"}
                    size={9}
                    color={todayColor}
                  />
                ) : null}
                <Text style={[styles.summaryPnlAmount, { color: todayColor }]}>
                  {maskValue(convertedTodayPnl, balancesHidden)}
                </Text>
                <Text style={[styles.summaryPnlPercent, { color: todayColor }]}>
                  ({maskValue(formatPnlPercent(todayPnlPercent), balancesHidden)})
                </Text>
              </View>
            </View>

            {allocation.length > 0 ? (
              <View style={[styles.allocationRow, { borderTopColor: colors.border }]}>
                {allocation.map((item) => (
                  <View key={item.symbol} style={styles.allocationItem}>
                    <Text style={[styles.allocationSymbol, { color: colors.foreground }]}>
                      {item.symbol}
                    </Text>
                    <Text style={[styles.allocationPercent, { color: colors.mutedForeground }]}>
                      {maskValue(`${item.percent.toFixed(1)}%`, balancesHidden)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {currencyMenuOpen ? (
            <Pressable
              style={styles.menuOverlay}
              onPress={() => setCurrencyMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Cerrar selector de moneda"
            />
          ) : null}
        </>
      ) : null}

      <CategoryBar activeCategory={activeCategory} onSelect={setActiveCategory} />

      <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
          No hay posiciones disponibles.
        </Text>
      </View>

      <AddAccountSheet visible={addAccountOpen} onClose={() => setAddAccountOpen(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 20,
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  summaryCard: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    zIndex: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  eyeButton: {
    marginTop: 0,
  },
  summaryLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 1,
  },
  summaryValue: {
    flex: 1,
    flexShrink: 1,
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  currencySelectorWrap: {
    position: "relative",
    zIndex: 10,
  },
  currencySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexShrink: 0,
  },
  currencySelectorText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
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
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  summaryPnlRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 11,
  },
  summaryPnlLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
    ...Platform.select({
      web: {
        textDecorationLine: "underline",
        textDecorationStyle: "dotted",
      },
      default: {
        borderBottomWidth: 1,
        borderStyle: "dotted",
        paddingBottom: 1,
      },
    }),
  },
  summaryPnlValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  summaryPnlAmount: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  summaryPnlPercent: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  allocationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 20,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  allocationItem: {
    alignItems: "flex-start",
    gap: 2,
  },
  allocationSymbol: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  allocationPercent: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  categoryBarScroll: {
    marginBottom: 16,
  },
  categoryBarContent: {
    gap: 8,
    paddingRight: 4,
  },
  categoryPill: {
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
