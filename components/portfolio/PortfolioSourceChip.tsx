import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { accountAvatarLetter } from "@/lib/portfolio/accounts/format";
import type { PortfolioSourceMeta } from "@/lib/portfolio/types";

import { SourceLogo } from "./SourceLogo";

const CHIP_SIZE = 36;

type PortfolioSourceChipProps = {
  source?: PortfolioSourceMeta;
  displayName?: string;
  variant?: "source" | "add";
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

export function PortfolioSourceChip({
  source,
  displayName,
  variant = "source",
  selected = false,
  onPress,
  accessibilityLabel,
}: PortfolioSourceChipProps) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(selected ? 1 : 0.96)).current;
  const avatarLetter =
    source?.id === "paper" && displayName ? accountAvatarLetter(displayName) : undefined;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: selected ? 1 : 0.96,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [scale, selected]);

  const borderColor = selected ? colors.primary : colors.border;
  const backgroundColor = selected ? "#1a0005" : colors.card;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            borderColor,
            backgroundColor,
            transform: [{ scale }],
          },
        ]}
      >
        {variant === "add" ? (
          <SourceLogo sourceId="add" brandColor={colors.primary} size={20} />
        ) : source ? (
          <View style={styles.logoWrap}>
            <SourceLogo
              sourceId={source.id}
              brandColor={source.brandColor}
              size={30}
              avatarLetter={avatarLetter}
            />
          </View>
        ) : null}
      </Animated.View>
      {source && selected ? (
        <Text style={[styles.caption, { color: colors.primary }]} numberOfLines={1}>
          {displayName ?? source.name}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoWrap: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    marginTop: 4,
    maxWidth: CHIP_SIZE + 8,
    textAlign: "center",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
});
