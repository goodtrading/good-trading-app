import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import type { PortfolioSourceId } from "@/lib/portfolio/types";

type SourceLogoProps = {
  sourceId: PortfolioSourceId | "add";
  brandColor?: string;
  size?: number;
  avatarLetter?: string;
};

function BinanceMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="16" fill="#1E2329" />
      <Path
        d="M12.1 16L9.7 13.6L7.3 16L9.7 18.4L12.1 16ZM16 12.1L20.7 7.4L23.1 9.8L18.4 14.5L16 12.1ZM23.3 16L20.9 13.6L18.5 16L20.9 18.4L23.3 16ZM16 19.9L11.3 24.6L8.9 22.2L13.6 17.5L16 19.9ZM16 10.5L13.6 8.1L16 5.7L18.4 8.1L16 10.5ZM24.3 16L21.9 18.4L19.5 16L21.9 13.6L24.3 16ZM16 23.5L18.4 25.9L16 28.3L13.6 25.9L16 23.5ZM7.7 16L10.1 18.4L12.5 16L10.1 13.6L7.7 16Z"
        fill="#F3BA2F"
      />
    </Svg>
  );
}

function BingXMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="16" cy="16" r="16" fill="#0B5FFF" />
      <Path
        d="M9 10H13.5L16 13.8L18.5 10H23L19 16L23 22H18.5L16 18.2L13.5 22H9L13 16L9 10Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

export function SourceLogo({
  sourceId,
  brandColor = "#666666",
  size = 22,
  avatarLetter,
}: SourceLogoProps) {
  if (sourceId === "binance") {
    return <BinanceMark size={size} />;
  }

  if (sourceId === "bingx") {
    return <BingXMark size={size} />;
  }

  if (sourceId === "paper") {
    const letter = avatarLetter ?? "P";
    return (
      <View style={[styles.letterWrap, { width: size, height: size, backgroundColor: "#1a1a1a" }]}>
        <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{letter}</Text>
      </View>
    );
  }

  if (sourceId === "add") {
    return (
      <View style={[styles.letterWrap, { width: size, height: size, backgroundColor: "#111111" }]}>
        <Text style={[styles.plus, { fontSize: size * 0.5, color: brandColor }]}>+</Text>
      </View>
    );
  }

  return (
    <View style={[styles.letterWrap, { width: size, height: size, backgroundColor: brandColor }]}>
      <Text style={[styles.letter, { fontSize: size * 0.34 }]}>ALL</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letterWrap: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  plus: {
    fontFamily: "Inter_700Bold",
    lineHeight: 18,
  },
});
