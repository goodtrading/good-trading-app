import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useCarteraTabShell } from "@/lib/cartera/context/CarteraTabShellContext";
import { CARTERA_CONTEXT_LABELS, type CarteraContext } from "@/lib/cartera/types";

const TAB_COUNT = 5;
const CARTERA_TAB_INDEX = 3;
const SWITCHER_WIDTH = 252;
const FLOAT_OFFSET_ABOVE_TAB = 22;

type SwitcherOption = {
  id: CarteraContext;
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

const OPTIONS: SwitcherOption[] = [
  { id: "TRADING", label: CARTERA_CONTEXT_LABELS.TRADING, icon: "trending-up" },
  { id: "INVENTORY", label: CARTERA_CONTEXT_LABELS.INVENTORY, icon: "archive" },
  { id: "PORTFOLIO", label: CARTERA_CONTEXT_LABELS.PORTFOLIO, icon: "pie-chart" },
];

function withOpacity(hexColor: string, opacity: number): string {
  if (!hexColor.startsWith("#") || hexColor.length !== 7) {
    return hexColor;
  }

  const alpha = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0");

  return `${hexColor}${alpha}`;
}

/**
 * Floating mini-tabs anchored above the Cartera bottom-tab button.
 * Not a modal — a visual extension of the tab bar.
 */
export function CarteraTabAnchoredSwitcher() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { context, isSwitcherOpen, isOnCarteraTab, setContext } = useCarteraTabShell();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  const tabBarHeight = Platform.OS === "web" ? 84 : 49;
  const bottomOffset = insets.bottom + tabBarHeight + FLOAT_OFFSET_ABOVE_TAB;
  const tabWidth = screenWidth / TAB_COUNT;
  const carteraCenterX = tabWidth * CARTERA_TAB_INDEX + tabWidth / 2;
  const left = Math.min(
    Math.max(carteraCenterX - SWITCHER_WIDTH / 2, 8),
    screenWidth - SWITCHER_WIDTH - 8,
  );

  const switcherBackground = colors.card;
  const visible = isOnCarteraTab && isSwitcherOpen;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 8,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  if (!isOnCarteraTab) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.anchor,
        {
          left,
          bottom: bottomOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.switcher,
          {
            borderColor: colors.border,
            backgroundColor: switcherBackground,
            shadowColor: colors.foreground,
          },
        ]}
        accessibilityRole="tablist"
        accessibilityLabel="Modos de Cartera"
      >
        {OPTIONS.map((option) => {
          const selected = context === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setContext(option.id)}
              style={[
                styles.option,
                selected && { backgroundColor: withOpacity(colors.secondary, 0.7) },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <Feather
                name={option.icon}
                size={18}
                color={selected ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.optionLabel,
                  { color: selected ? colors.primary : colors.mutedForeground },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={[
          styles.caret,
          {
            borderTopColor: switcherBackground,
            left: carteraCenterX - left - 6,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    width: SWITCHER_WIDTH,
    zIndex: 100,
    elevation: 10,
  },
  switcher: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.144,
    shadowRadius: 6,
  },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 4,
  },
  optionLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  caret: {
    position: "absolute",
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
