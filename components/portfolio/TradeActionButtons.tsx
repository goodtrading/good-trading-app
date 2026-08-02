import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type TradeActionButtonsProps = {
  submitting: boolean;
  disabledLong?: boolean;
  disabledShort?: boolean;
  onLongPress: () => void;
  onShortPress: () => void;
};

/**
 * Sole control for trade direction.
 * Long → direction LONG, Short → direction SHORT.
 */
export function TradeActionButtons({
  submitting,
  disabledLong = false,
  disabledShort = false,
  onLongPress,
  onShortPress,
}: TradeActionButtonsProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onLongPress}
        disabled={submitting || disabledLong}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.success,
            opacity: pressed || submitting || disabledLong ? 0.55 : 1,
          },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Comprar / Long</Text>
        )}
      </Pressable>

      <Pressable
        onPress={onShortPress}
        disabled={submitting || disabledShort}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: pressed || submitting || disabledShort ? 0.55 : 1,
          },
        ]}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Vender / Short</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
});
