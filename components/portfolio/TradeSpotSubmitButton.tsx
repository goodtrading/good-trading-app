import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import type { SpotTradeSide } from "@/components/portfolio/TradeSpotSideSelector";
import { useColors } from "@/hooks/useColors";

type TradeSpotSubmitButtonProps = {
  side: SpotTradeSide;
  submitting: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** SPOT-only execute control — direction comes from Open/Close tabs above. */
export function TradeSpotSubmitButton({
  side,
  submitting,
  disabled = false,
  onPress,
}: TradeSpotSubmitButtonProps) {
  const colors = useColors();
  const isOpen = side === "OPEN";

  return (
    <Pressable
      onPress={onPress}
      disabled={submitting || disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isOpen ? colors.success : colors.primary,
          opacity: pressed || submitting || disabled ? 0.55 : 1,
        },
      ]}
    >
      {submitting ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text style={styles.buttonText}>
          {isOpen ? "Open / Buy" : "Close / Sell"}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
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
