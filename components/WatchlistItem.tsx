import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { editorial } from "@/constants/editorial";
import type { AssetStatus } from "@/lib/assets/types";
import type { FlipDistanceTone } from "@/lib/watchlist/flipDistance";
import type { WatchlistRegimeTone } from "@/lib/watchlist/formatters";

interface WatchlistItemProps {
  symbol: string;
  name: string;
  price: string;
  change?: string;
  changeDirection?: "up" | "down" | "neutral";
  showChange?: boolean;
  gammaRegime?: string;
  regimeTone?: WatchlistRegimeTone;
  showRegime?: boolean;
  localFlip?: string;
  showLocalFlip?: boolean;
  flipDistance?: string;
  flipDistanceTone?: FlipDistanceTone;
  showFlipDistance?: boolean;
  isFavorite?: boolean;
  status?: AssetStatus;
  isActive?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
}

export function WatchlistItem({
  symbol,
  name,
  price,
  change,
  changeDirection = "neutral",
  showChange = false,
  gammaRegime,
  regimeTone = "neutral",
  showRegime = false,
  localFlip,
  showLocalFlip = false,
  flipDistance,
  flipDistanceTone = "neutral",
  showFlipDistance = false,
  isFavorite = false,
  status = "active",
  isActive = false,
  onPress,
  onToggleFavorite,
}: WatchlistItemProps) {
  const colors = useColors();
  const isUp = changeDirection === "up";
  const isDown = changeDirection === "down";
  const changeColor = isUp ? colors.success : isDown ? colors.destructive : colors.mutedForeground;
  const regimeColor =
    regimeTone === "long"
      ? colors.success
      : regimeTone === "short"
        ? colors.destructive
        : colors.mutedForeground;
  const flipDistanceColor =
    flipDistanceTone === "above"
      ? colors.success
      : flipDistanceTone === "below"
        ? colors.destructive
        : colors.mutedForeground;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={styles.symbolRow}>
        {onToggleFavorite ? (
          <Pressable
            onPress={() => onToggleFavorite()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? "Quitar favorito" : "Marcar favorito"}
          >
            <Text
              style={[
                styles.favoriteStar,
                { color: isFavorite ? colors.gold ?? colors.primary : colors.mutedForeground },
              ]}
            >
              {isFavorite ? "★" : "☆"}
            </Text>
          </Pressable>
        ) : null}
        <Text
          style={[
            styles.symbol,
            {
              color: colors.foreground,
              fontFamily: isActive ? "Inter_700Bold" : "Inter_600SemiBold",
            },
          ]}
        >
          {symbol}
        </Text>
        {status === "coming_soon" ? (
          <Text style={[styles.comingSoonBadge, { color: colors.mutedForeground }]}>
            Próximamente
          </Text>
        ) : null}
      </View>

      <Text style={[styles.name, { color: colors.mutedForeground }]}>{name}</Text>
      <Text style={[styles.price, { color: colors.foreground }]}>{price}</Text>

      {showChange && change ? (
        <View style={styles.changeRow}>
          <Text style={[styles.changeIcon, { color: changeColor }]}>
            {isUp ? "▲" : isDown ? "▼" : "—"}
          </Text>
          <Text style={[styles.change, { color: changeColor }]}>{change}</Text>
        </View>
      ) : null}

      {showRegime && gammaRegime ? (
        <Text style={[styles.regime, { color: regimeColor }]}>{gammaRegime}</Text>
      ) : null}

      {showLocalFlip && localFlip ? (
        <Text style={[styles.localFlip, { color: colors.mutedForeground }]}>
          Local Flip: {localFlip}
        </Text>
      ) : null}

      {showFlipDistance && flipDistance ? (
        <Text style={[styles.flipDistance, { color: flipDistanceColor }]}>{flipDistance}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: editorial.sectionGap / 2,
    gap: 5,
  },
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  favoriteStar: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Inter_700Bold",
  },
  symbol: {
    fontSize: 18,
    letterSpacing: 0.5,
  },
  comingSoonBadge: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.4,
  },
  name: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  price: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
    lineHeight: 28,
    marginTop: 2,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  changeIcon: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  change: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  regime: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  localFlip: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
    marginTop: 2,
  },
  flipDistance: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
