import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type TradeRiskOptionsProps = {
  tpSlEnabled: boolean;
  reduceOnlyEnabled: boolean;
  postOnlyEnabled: boolean;
  takeProfitPrice: string;
  stopLossPrice: string;
  onTpSlChange: (enabled: boolean) => void;
  onReduceOnlyChange: (enabled: boolean) => void;
  onPostOnlyChange: (enabled: boolean) => void;
  onTakeProfitPriceChange: (value: string) => void;
  onStopLossPriceChange: (value: string) => void;
  /** When false, hides Reduce Only (e.g. edit-TP/SL modal). Default true. */
  showReduceOnly?: boolean;
  /** When false, hides Post Only (e.g. MARKET orders). Default false. */
  showPostOnly?: boolean;
};

/**
 * Risk toggles + TP/SL price inputs.
 * Stacked column layout only — no inline grid.
 */
export function TradeRiskOptions({
  tpSlEnabled,
  reduceOnlyEnabled,
  postOnlyEnabled,
  takeProfitPrice,
  stopLossPrice,
  onTpSlChange,
  onReduceOnlyChange,
  onPostOnlyChange,
  onTakeProfitPriceChange,
  onStopLossPriceChange,
  showReduceOnly = true,
  showPostOnly = false,
}: TradeRiskOptionsProps) {
  const colors = useColors();

  return (
    <View style={styles.wrap}>
      <CheckboxRow
        label="TP / SL"
        checked={tpSlEnabled}
        onPress={() => onTpSlChange(!tpSlEnabled)}
        colors={colors}
      />

      {tpSlEnabled ? (
        <>
          <View
            style={[
              styles.block,
              { borderColor: colors.border, backgroundColor: colors.secondary },
            ]}
          >
            <PriceField
              label="Take Profit"
              value={takeProfitPrice}
              onChange={onTakeProfitPriceChange}
              colors={colors}
            />
          </View>

          <View
            style={[
              styles.block,
              { borderColor: colors.border, backgroundColor: colors.secondary },
            ]}
          >
            <PriceField
              label="Stop Loss"
              value={stopLossPrice}
              onChange={onStopLossPriceChange}
              colors={colors}
            />
          </View>
        </>
      ) : null}

      {showReduceOnly ? (
        <CheckboxRow
          label="Reduce Only"
          checked={reduceOnlyEnabled}
          onPress={() => onReduceOnlyChange(!reduceOnlyEnabled)}
          colors={colors}
        />
      ) : null}

      {showPostOnly ? (
        <CheckboxRow
          label="Post Only"
          checked={postOnlyEnabled}
          onPress={() => onPostOnlyChange(!postOnlyEnabled)}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

function PriceField({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      />
    </View>
  );
}

function CheckboxRow({
  label,
  checked,
  onPress,
  colors,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.checkboxRow, { opacity: pressed ? 0.75 : 1 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: colors.border,
            backgroundColor: checked ? colors.primary : "transparent",
          },
        ]}
      >
        {checked ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <Text style={[styles.checkboxLabel, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 16,
  },
  block: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  field: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  input: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Inter_600SemiBold",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    minHeight: 24,
  },
  box: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  check: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    lineHeight: 14,
  },
  checkboxLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
  },
});
