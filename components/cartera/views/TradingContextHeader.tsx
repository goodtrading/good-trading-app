import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { PortfolioSourceSelector } from "@/components/portfolio/PortfolioSourceSelector";
import { useColors } from "@/hooks/useColors";
import { useTradingContext } from "@/lib/cartera";
import { getSourceMeta } from "@/lib/portfolio";

type TradingContextHeaderProps = {
  onAddPress: () => void;
  onAccountInfoRequest: (accountId: string) => void;
};

export function TradingContextHeader({
  onAddPress,
  onAccountInfoRequest,
}: TradingContextHeaderProps) {
  const colors = useColors();
  const { selection, paperAccounts } = useTradingContext();

  const sourceLabel = (() => {
    if (selection?.type === "paper") {
      const account = paperAccounts.find((entry) => entry.id === selection.accountId);
      return account?.name ?? "Paper Trading";
    }
    if (selection?.type === "exchange") {
      return getSourceMeta(selection.sourceId).name;
    }
    return "Sin cuenta";
  })();

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.foreground }]}>Trading</Text>
          <Text style={[styles.sourceHint, { color: colors.mutedForeground }]}>
            Cuenta: <Text style={{ color: colors.primary }}>{sourceLabel}</Text>
          </Text>
        </View>
        <View style={styles.selector}>
          <PortfolioSourceSelector
            onAddPress={onAddPress}
            onAccountInfoRequest={onAccountInfoRequest}
          />
        </View>
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
  selector: {
    flexShrink: 0,
    maxWidth: "58%",
  },
});
