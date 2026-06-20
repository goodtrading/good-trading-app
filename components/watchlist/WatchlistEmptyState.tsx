import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type WatchlistEmptyStateProps = {
  onAddAsset: () => void;
};

export function WatchlistEmptyState({ onAddAsset }: WatchlistEmptyStateProps) {
  const colors = useColors();

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>
        No estás siguiendo ningún activo.
      </Text>
      <Pressable
        onPress={onAddAsset}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.buttonLabel, { color: colors.primaryForeground }]}>Agregar activo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 20,
    alignItems: "center",
    gap: 14,
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  button: {
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
});
