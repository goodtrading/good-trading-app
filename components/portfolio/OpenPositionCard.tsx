import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PositionLiveMetrics } from "@/components/portfolio/PositionLiveMetrics";
import type { PositionCardViewModel } from "@/components/portfolio/positionCardModel";
import { useColors } from "@/hooks/useColors";

type OpenPositionCardProps = {
  view: PositionCardViewModel;
  onClosePress?: () => void;
  onTpSlPress?: () => void;
  closing?: boolean;
};

/**
 * Shared trading position card (SPOT + PERP presentation).
 * Live mark/PnL isolated in PositionLiveMetrics subscriber.
 */
export const OpenPositionCard = memo(function OpenPositionCard({
  view,
  onClosePress,
  onTpSlPress,
  closing = false,
}: OpenPositionCardProps) {
  const colors = useColors();
  const isPerp = view.domain === "PERP";
  const sideColor = view.sideIsLong ? colors.success : colors.primary;
  const sideBadgeLabel = isPerp ? view.sideLabel : `${view.sideLabel} (Spot)`;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.sideBadge, { backgroundColor: sideColor }]}>
            <Text style={styles.sideBadgeText}>{sideBadgeLabel}</Text>
          </View>
          <Text style={[styles.symbol, { color: colors.foreground }]} numberOfLines={1}>
            {view.symbol}
          </Text>
          {isPerp ? (
            <>
              <Text style={[styles.headerMeta, { color: colors.mutedForeground }]}>
                {view.marginModeLabel}
              </Text>
              <Text style={[styles.leverageTag, { color: colors.foreground }]}>
                {view.leverage}x
              </Text>
            </>
          ) : (
            <Text style={[styles.headerMeta, { color: colors.mutedForeground }]}>
              Spot
            </Text>
          )}
        </View>
      </View>

      <PositionLiveMetrics view={view} />

      {onClosePress && onTpSlPress ? (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={onTpSlPress}
            disabled={closing}
            style={({ pressed }) => [
              styles.actionButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.secondary,
                opacity: pressed || closing ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Editar take profit y stop loss"
          >
            <Text style={[styles.actionText, { color: colors.foreground }]}>Editar TP/SL</Text>
          </Pressable>
          <Pressable
            onPress={onClosePress}
            disabled={closing}
            style={({ pressed }) => [
              styles.actionButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.secondary,
                opacity: pressed || closing ? 0.7 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar posición"
          >
            <Text style={[styles.actionText, { color: colors.primary }]}>
              {closing ? "Cerrando…" : "Cerrar"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  sideBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sideBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },
  symbol: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  headerMeta: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  leverageTag: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
});
