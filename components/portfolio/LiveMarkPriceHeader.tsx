import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LiveMarkPriceRow } from "@/components/portfolio/LiveMarkPriceRow";
import { useColors } from "@/hooks/useColors";
import { formatUsd } from "@/lib/portfolio/accounts/format";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";

const SUBTITLE_COLOR = "#8B8F98";

export type LiveMarkPriceBadge = {
  label: string;
  tone?: "neutral" | "buy" | "sell";
};

type LiveMarkPriceHeaderProps = {
  /** Subscribes to tick store — no price prop. */
  symbol?: string;
  /** Shown next to the symbol (Nueva Operación). Ignored when `badges` is set. */
  subtitle?: string;
  /** Optional section label above the symbol row (e.g. TP / SL). */
  sectionTitle?: string;
  /** Optional badges next to the symbol (Spot/Perp, Comprar/Vender). */
  badges?: LiveMarkPriceBadge[];
  /** Static entry price row. */
  entryPrice?: number | null;
  entryPriceLabel?: string;
  /** Label above the live mark row. */
  referencePriceLabel?: string;
  /** When false, hides the live mark row (static header only). */
  showLivePrice?: boolean;
};

/**
 * Static header chrome + isolated live mark row subscriber.
 */
export const LiveMarkPriceHeader = memo(function LiveMarkPriceHeader({
  symbol = PORTFOLIO_V1_SYMBOL,
  subtitle = "Nueva Operación",
  sectionTitle,
  badges,
  entryPrice,
  entryPriceLabel = "Precio de Entrada",
  referencePriceLabel,
  showLivePrice = true,
}: LiveMarkPriceHeaderProps) {
  const colors = useColors();

  const badgeToneColor = (tone: LiveMarkPriceBadge["tone"]) => {
    if (tone === "buy") return colors.success;
    if (tone === "sell") return colors.primary;
    return colors.mutedForeground;
  };

  return (
    <View style={styles.wrap}>
      {sectionTitle ? (
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
          {sectionTitle}
        </Text>
      ) : null}

      <View style={styles.titleRow}>
        <Text style={[styles.symbol, { color: colors.foreground }]}>{symbol}</Text>
        {badges && badges.length > 0
          ? badges.map((badge) => (
              <View
                key={badge.label}
                style={[
                  styles.badge,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.secondary,
                  },
                ]}
              >
                <Text
                  style={[styles.badgeText, { color: badgeToneColor(badge.tone) }]}
                >
                  {badge.label}
                </Text>
              </View>
            ))
          : (
              <Text style={styles.subtitle}>{subtitle}</Text>
            )}
      </View>

      {entryPrice != null && entryPrice > 0 ? (
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>
            {entryPriceLabel}
          </Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            {formatUsd(entryPrice)}
          </Text>
        </View>
      ) : null}

      {showLivePrice ? (
        <LiveMarkPriceRow symbol={symbol} referencePriceLabel={referencePriceLabel} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  symbol: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_400Regular",
    color: SUBTITLE_COLOR,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: "Inter_600SemiBold",
  },
  metaBlock: {
    flexDirection: "column",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 4,
  },
  metaLabel: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Inter_500Medium",
  },
  metaValue: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_600SemiBold",
  },
});
