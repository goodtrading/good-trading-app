import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

/** Visible order types (MARKET executes now; LIMIT → placeLimitOrder). */
export type TradeOrderType = "MARKET" | "LIMIT";

type TradeOrderTypeSelectorProps = {
  value: TradeOrderType;
  onChange: (value: TradeOrderType) => void;
};

const OPTIONS: TradeOrderType[] = ["MARKET", "LIMIT"];

export function TradeOrderTypeSelector({ value, onChange }: TradeOrderTypeSelectorProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? colors.secondary : "transparent",
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: selected ? colors.primary : colors.mutedForeground },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
});
