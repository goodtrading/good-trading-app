import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import type { WealthSlice } from "@/lib/cartera/read/types";
import { wealthSliceColor } from "@/lib/cartera/read/types";

type DonutChartProps = {
  slices: WealthSlice[];
  size?: number;
  strokeWidth?: number;
};

export function DonutChart({ slices, size = 220, strokeWidth = 28 }: DonutChartProps) {
  const colors = useColors();
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetPercent = 0;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {slices.map((slice) => {
          const dash = (slice.percent / 100) * circumference;
          const gap = Math.max(circumference - dash, 0);
          const rotation = (offsetPercent / 100) * 360 - 90;
          offsetPercent += slice.percent;

          return (
            <Circle
              key={slice.symbol}
              cx={center}
              cy={center}
              r={radius}
              stroke={wealthSliceColor(slice.symbol)}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${dash} ${gap}`}
              rotation={rotation}
              origin={`${center}, ${center}`}
              strokeLinecap="butt"
            />
          );
        })}
      </Svg>
      <View style={styles.centerLabel} pointerEvents="none">
        <Text style={[styles.centerTitle, { color: colors.mutedForeground }]}>Patrimonio</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
  },
  centerLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  centerTitle: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
});
