import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type TradeMarginInputProps = {
  margin: string;
  onMarginChange: (value: string) => void;
  /** 0–100, kept in sync with margin input. */
  balancePercent: number;
  onBalancePercentChange: (percent: number) => void;
  availableBalanceLabel: string;
  /** Derived quantity (read-only). */
  quantityDisplay: string;
  error?: string;
  onMaxPress?: () => void;
  inputLabel?: string;
  unitLabel?: string;
  showQuantityPreview?: boolean;
};

const PERCENT_MARKS = [0, 25, 50, 75, 100] as const;

/**
 * Margin-first sizing control (Binance Futures style).
 * Quantity is displayed as a derived value only.
 */
export function TradeMarginInput({
  margin,
  onMarginChange,
  balancePercent,
  onBalancePercentChange,
  availableBalanceLabel,
  quantityDisplay,
  error,
  onMaxPress,
  inputLabel = "Margen",
  unitLabel = "USDT",
  showQuantityPreview = true,
}: TradeMarginInputProps) {
  const colors = useColors();
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  const clampPercent = useCallback((value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, value));
  }, []);

  const updateFromX = useCallback(
    (locationX: number) => {
      const width = trackWidthRef.current;
      if (width <= 0) return;
      const percent = clampPercent((locationX / width) * 100);
      onBalancePercentChange(percent);
    },
    [clampPercent, onBalancePercentChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          updateFromX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateFromX(event.nativeEvent.locationX);
        },
      }),
    [updateFromX],
  );

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  const thumbLeft = trackWidth > 0 ? (balancePercent / 100) * trackWidth : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{inputLabel}</Text>
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>{unitLabel}</Text>
      </View>

      <TextInput
        value={margin}
        onChangeText={onMarginChange}
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

      <View style={styles.balanceRow}>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          {availableBalanceLabel}
        </Text>
        {onMaxPress ? (
          <Pressable onPress={onMaxPress} hitSlop={8}>
            <Text style={[styles.maxLabel, { color: colors.primary }]}>MAX</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.primary }]}>{error}</Text> : null}

      <View
        style={styles.sliderHit}
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.trackFill,
              {
                width: `${balancePercent}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: Math.max(0, thumbLeft - 10),
              backgroundColor: colors.foreground,
              borderColor: colors.primary,
            },
          ]}
        />
      </View>

      <View style={styles.marksRow}>
        {PERCENT_MARKS.map((mark) => (
          <Text
            key={mark}
            style={[
              styles.mark,
              {
                color:
                  Math.abs(balancePercent - mark) < 0.5
                    ? colors.primary
                    : colors.mutedForeground,
              },
            ]}
          >
            {mark}%
          </Text>
        ))}
      </View>

      {showQuantityPreview ? (
        <View style={[styles.qtyBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
          <Text style={[styles.qtyLabel, { color: colors.mutedForeground }]}>Cantidad</Text>
          <Text style={[styles.qtyValue, { color: colors.foreground }]}>{quantityDisplay}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  unit: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  hint: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  maxLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  error: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  sliderHit: {
    height: 28,
    justifyContent: "center",
    marginTop: 4,
  },
  track: {
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 999,
  },
  thumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    top: 4,
  },
  marksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mark: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  qtyBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  qtyLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  qtyValue: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
