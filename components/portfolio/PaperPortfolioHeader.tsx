import React, { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  formatPaperCurrencyAmount,
  formatPaperPnlPercent,
  maskDisplayValue,
  PAPER_CURRENCY_OPTIONS,
  type PaperConversionRates,
  type PaperDisplayCurrency,
} from "@/components/portfolio/paperDisplay";
import { useColors } from "@/hooks/useColors";
import { formatUsd, signedValueColor } from "@/lib/portfolio/accounts/format";

type Props = {
  equityUsd: number;
  totalReturnPercent: number;
  initialBalance: number;
  cashBalance: number;
  conversionRates: PaperConversionRates;
};

export function PaperPortfolioHeader({
  equityUsd,
  totalReturnPercent,
  initialBalance,
  cashBalance,
  conversionRates,
}: Props) {
  const colors = useColors();
  const [balancesHidden, setBalancesHidden] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<PaperDisplayCurrency>("USDT");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);

  const returnColor = signedValueColor(totalReturnPercent, colors);
  const isReturnPositive = totalReturnPercent > 0;

  const primaryValue = formatPaperCurrencyAmount(equityUsd, selectedCurrency, conversionRates);
  const usdEquivalent = formatUsd(equityUsd);

  const handleSelectCurrency = (currency: PaperDisplayCurrency) => {
    setSelectedCurrency(currency);
    setCurrencyMenuOpen(false);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
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
          {maskDisplayValue(primaryValue, balancesHidden)}
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
              {PAPER_CURRENCY_OPTIONS.map((currency) => (
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

      <View style={styles.usdReturnRow}>
        <Text style={[styles.usdEquivalent, { color: colors.mutedForeground }]}>
          ≈ {maskDisplayValue(usdEquivalent, balancesHidden)}
        </Text>

        <View style={styles.returnWrap}>
          {!balancesHidden && totalReturnPercent !== 0 ? (
            <Feather
              name={isReturnPositive ? "arrow-up-right" : "arrow-down-right"}
              size={12}
              color={returnColor}
            />
          ) : null}
          <Text style={[styles.returnValue, { color: returnColor }]}>
            {maskDisplayValue(formatPaperPnlPercent(totalReturnPercent), balancesHidden)}
          </Text>
        </View>
      </View>

      {currencyMenuOpen ? (
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setCurrencyMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Cerrar selector de moneda"
        />
      ) : null}

      <View style={[styles.capitalBlock, { borderTopColor: colors.border }]}>
        <View style={styles.capitalRow}>
          <Text style={[styles.capitalLabel, { color: colors.mutedForeground }]}>Capital inicial</Text>
          <Text style={[styles.capitalValue, { color: colors.foreground }]}>
            {maskDisplayValue(formatUsd(initialBalance), balancesHidden)}
          </Text>
        </View>
        <View style={styles.capitalRow}>
          <Text style={[styles.capitalLabel, { color: colors.mutedForeground }]}>Cash disponible</Text>
          <Text style={[styles.capitalValue, { color: colors.foreground }]}>
            {maskDisplayValue(formatUsd(cashBalance), balancesHidden)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
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
  },
  summaryValue: {
    flex: 1,
    flexShrink: 1,
    fontSize: 35,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
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
  usdReturnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 12,
  },
  usdEquivalent: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
  returnWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  returnValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  capitalBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  capitalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  capitalLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  capitalValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
});
