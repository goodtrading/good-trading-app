import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getSourceMeta, usePortfolioSource } from "@/lib/portfolio";

import { PortfolioSourceSelector } from "./PortfolioSourceSelector";

type PortfolioScreenHeaderProps = {
  onAddPress: () => void;
};

export function PortfolioScreenHeader({ onAddPress }: PortfolioScreenHeaderProps) {
  const colors = useColors();
  const { selectedSource } = usePortfolioSource();
  const sourceMeta = getSourceMeta(selectedSource);

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>Cartera</Text>
          <Text style={[styles.sourceHint, { color: colors.mutedForeground }]}>
            Fuente: <Text style={{ color: colors.primary }}>{sourceMeta.name}</Text>
          </Text>
        </View>
        <PortfolioSourceSelector onAddPress={onAddPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  sourceHint: {
    marginTop: 4,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
