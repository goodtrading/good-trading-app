import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { TradeOrderType } from "@/components/portfolio/TradeOrderTypeSelector";

type TradePriceInputProps = {
  orderType: TradeOrderType;
  marketPrice: number;
  limitPrice: string;
  onLimitPriceChange: (value: string) => void;
  error?: string;
};

const PRICE_STEP = 10;

/**
 * LIMIT price entry only.
 * MARKET uses live mark from the trading header / execution context — no duplicate cell.
 */
export function TradePriceInput({
  orderType,
  marketPrice,
  limitPrice,
  onLimitPriceChange,
  error,
}: TradePriceInputProps) {
  const colors = useColors();

  if (orderType === "MARKET") {
    if (!error) return null;
    return (
      <Text style={[styles.error, { color: colors.primary }]}>{error}</Text>
    );
  }

  const nudge = (delta: number) => {
    const current = Number(limitPrice.replace(/,/g, ""));
    const base = Number.isFinite(current) && current > 0 ? current : marketPrice;
    const next = Math.max(0, base + delta);
    onLimitPriceChange(String(next));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>Precio límite</Text>
      <View style={styles.limitRow}>
        <Pressable
          onPress={() => nudge(-PRICE_STEP)}
          style={({ pressed }) => [
            styles.stepButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.stepText, { color: colors.foreground }]}>−</Text>
        </Pressable>
        <TextInput
          value={limitPrice}
          onChangeText={onLimitPriceChange}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: error ? colors.primary : colors.border,
              backgroundColor: colors.background,
            },
          ]}
        />
        <Pressable
          onPress={() => nudge(PRICE_STEP)}
          style={({ pressed }) => [
            styles.stepButton,
            {
              borderColor: colors.border,
              backgroundColor: colors.secondary,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.stepText, { color: colors.foreground }]}>+</Text>
        </Pressable>
      </View>
      {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepButton: {
    width: 44,
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
});
