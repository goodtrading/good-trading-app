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
};

type AddOption = {
  id: string;
  label: string;
  sourceId?: PortfolioSourceId;
  comingSoon?: boolean;
  description?: string;
};

const ADD_OPTIONS: AddOption[] = [
  { id: "binance", label: "Conectar Binance", sourceId: "binance", comingSoon: true },
  { id: "bingx", label: "Conectar BingX", sourceId: "bingx", comingSoon: true },
  { id: "paper", label: "Crear cuenta Paper", sourceId: "paper" },
  {
    id: "more",
    label: "Próximamente",
    comingSoon: true,
    description: "Bybit, OKX, Hyperliquid y wallets on-chain",
  },
];

export function AddAccountSheet({ visible, onClose }: AddAccountSheetProps) {
  const colors = useColors();
  const { setSelectedSource } = usePortfolioSource();

  const handleOptionPress = (option: AddOption) => {
    if (option.comingSoon) return;
    if (option.sourceId) {
      setSelectedSource(option.sourceId);
    }
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} title="AGREGAR CUENTA" onClose={onClose}>
      {ADD_OPTIONS.map((option, index) => {
        const isLast = index === ADD_OPTIONS.length - 1;
        const disabled = Boolean(option.comingSoon && option.id !== "more");

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
              ) : (
                <View style={[styles.soonIcon, { borderColor: colors.border }]}>
                  <Feather name="clock" size={14} color={colors.mutedForeground} />
                </View>
              )}
              <View style={styles.copy}>
                <Text style={[styles.label, { color: colors.foreground }]}>{option.label}</Text>
                {option.description ? (
                  <Text style={[styles.description, { color: colors.mutedForeground }]}>
                    {option.description}
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
  soonIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
