import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { CarteraMode } from "@/lib/portfolio/carteraMode";

type CarteraModeTabsProps = {
  mode: CarteraMode;
  onModeChange: (mode: CarteraMode) => void;
};

const MODES: { id: CarteraMode; label: string }[] = [
  { id: "wallet", label: "Wallet" },
  { id: "portfolio", label: "Portfolio" },
];

export function CarteraModeTabs({ mode, onModeChange }: CarteraModeTabsProps) {
  const colors = useColors();

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {MODES.map((entry) => {
        const active = entry.id === mode;
        return (
          <Pressable
            key={entry.id}
            onPress={() => onModeChange(entry.id)}
            style={[
              styles.tab,
              active && { backgroundColor: colors.secondary },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={entry.label}
          >
            <Text
              style={[
                styles.tabText,
                { color: active ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 6,
    padding: 3,
    gap: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
});
