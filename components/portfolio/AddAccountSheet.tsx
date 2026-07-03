import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { BottomSheetModal } from "@/components/BottomSheetModal";
import { useColors } from "@/hooks/useColors";
import { usePortfolioSource } from "@/lib/portfolio";
import type { PortfolioSourceId } from "@/lib/portfolio/types";

import { SourceLogo } from "./SourceLogo";

type AddAccountSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCreatePaperPress: () => void;
};

type AddOption = {
  id: string;
  label: string;
  sourceId?: PortfolioSourceId;
  comingSoon?: boolean;
  disabled?: boolean;
};

export function AddAccountSheet({ visible, onClose, onCreatePaperPress }: AddAccountSheetProps) {
  const colors = useColors();
  const { canCreatePaperAccount } = usePortfolioSource();

  const ADD_OPTIONS: AddOption[] = [
    {
      id: "paper",
      label: "Paper Trading",
      sourceId: "paper",
      disabled: !canCreatePaperAccount,
    },
    { id: "binance", label: "Binance", sourceId: "binance", comingSoon: true },
    { id: "bingx", label: "BingX", sourceId: "bingx", comingSoon: true },
  ];

  const handleOptionPress = (option: AddOption) => {
    if (option.comingSoon || option.disabled) return;
    if (option.id === "paper") {
      onClose();
      onCreatePaperPress();
      return;
    }
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} title="Agregar cuenta" onClose={onClose}>
      {ADD_OPTIONS.map((option, index) => {
        const isLast = index === ADD_OPTIONS.length - 1;
        const disabled = Boolean(option.comingSoon || option.disabled);

        return (
          <Pressable
            key={option.id}
            onPress={() => handleOptionPress(option)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.row,
              !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
              { opacity: pressed && !disabled ? 0.75 : disabled ? 0.55 : 1 },
            ]}
          >
            <View style={styles.rowLeft}>
              {option.sourceId ? (
                <SourceLogo sourceId={option.sourceId} size={28} />
              ) : null}
              <View style={styles.copy}>
                <Text style={[styles.label, { color: colors.foreground }]}>{option.label}</Text>
                {option.id === "paper" && !canCreatePaperAccount ? (
                  <Text style={[styles.description, { color: colors.mutedForeground }]}>
                    Máximo 3 cuentas Paper
                  </Text>
                ) : null}
              </View>
            </View>
            {option.comingSoon ? (
              <Text style={[styles.badge, { color: colors.mutedForeground }]}>Próximamente</Text>
            ) : (
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            )}
          </Pressable>
        );
      })}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  copy: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  description: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  badge: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
});
