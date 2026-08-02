import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export type SpotTradeSide = "OPEN" | "CLOSE";

type TradeSpotSideSelectorProps = {
  value: SpotTradeSide;
  onChange: (value: SpotTradeSide) => void;
};

const OPTIONS: { id: SpotTradeSide; label: string }[] = [
  { id: "OPEN", label: "Open / Buy" },
  { id: "CLOSE", label: "Close / Sell" },
];

/** SPOT-only direction tabs — same chip style as Market | Limit. */
export function TradeSpotSideSelector({ value, onChange }: TradeSpotSideSelectorProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
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
              {option.label}
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
