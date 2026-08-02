import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export type MarginMode = "CROSS" | "ISOLATED";

type TradeLeverageSelectorProps = {
  marginMode: MarginMode;
  leverage: number;
  onMarginModeChange: (mode: MarginMode) => void;
  onLeverageChange: (leverage: number) => void;
};

const MARGIN_OPTIONS: MarginMode[] = ["CROSS", "ISOLATED"];
const LEVERAGE_OPTIONS = Array.from({ length: 125 }, (_, index) => index + 1);

/**
 * Compact margin mode + leverage dropdowns (Binance-style single buttons).
 * Leverage is form state; applied on execute via TradeExecutionRequest.
 * marginMode is stored on the request (engine does not branch on it yet).
 */
export function TradeLeverageSelector({
  marginMode,
  leverage,
  onMarginModeChange,
  onLeverageChange,
}: TradeLeverageSelectorProps) {
  const colors = useColors();
  const [marginOpen, setMarginOpen] = useState(false);
  const [leverageOpen, setLeverageOpen] = useState(false);

  return (
    <View style={styles.row}>
      <DropdownButton
        label={marginMode === "CROSS" ? "Cross" : "Isolated"}
        onPress={() => setMarginOpen(true)}
        colors={colors}
      />
      <DropdownButton
        label={`${leverage}x`}
        onPress={() => setLeverageOpen(true)}
        colors={colors}
      />

      <OptionsModal
        visible={marginOpen}
        title="Modo de margen"
        onClose={() => setMarginOpen(false)}
        colors={colors}
      >
        {MARGIN_OPTIONS.map((mode) => (
          <OptionRow
            key={mode}
            label={mode === "CROSS" ? "Cross" : "Isolated"}
            selected={marginMode === mode}
            onPress={() => {
              onMarginModeChange(mode);
              setMarginOpen(false);
            }}
            colors={colors}
          />
        ))}
      </OptionsModal>

      <OptionsModal
        visible={leverageOpen}
        title="Apalancamiento"
        onClose={() => setLeverageOpen(false)}
        colors={colors}
        scroll
      >
        {LEVERAGE_OPTIONS.map((option) => (
          <OptionRow
            key={option}
            label={`${option}x`}
            selected={leverage === option}
            onPress={() => {
              onLeverageChange(option);
              setLeverageOpen(false);
            }}
            colors={colors}
          />
        ))}
      </OptionsModal>
    </View>
  );
}

function DropdownButton({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dropdownButton,
        {
          borderColor: colors.border,
          backgroundColor: colors.secondary,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.dropdownLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.chevron, { color: colors.mutedForeground }]}>▼</Text>
    </Pressable>
  );
}

function OptionsModal({
  visible,
  title,
  onClose,
  colors,
  children,
  scroll = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
          {scroll ? (
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={styles.modalList}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        {
          backgroundColor: selected ? colors.secondary : "transparent",
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.optionLabel,
          { color: selected ? colors.primary : colors.foreground },
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <Text style={[styles.optionCheck, { color: colors.primary }]}>✓</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  dropdownButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dropdownLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chevron: {
    fontSize: 10,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    maxHeight: "70%",
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  modalList: {
    paddingBottom: 4,
  },
  modalScroll: {
    maxHeight: 320,
  },
  optionRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  optionCheck: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
