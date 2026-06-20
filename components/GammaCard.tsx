import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface GammaCardProps {
  state: string;
  level: number;
  netGamma: string;
  flipPoint: string;
  description: string;
  dominantExpiry: string;
  hideNetGamma?: boolean;
  netGammaStale?: boolean;
  flipPointStale?: boolean;
  dominantExpiryStale?: boolean;
}

export function GammaCard({
  state,
  level,
  netGamma,
  flipPoint,
  description,
  dominantExpiry,
  hideNetGamma = false,
  netGammaStale = false,
  flipPointStale = false,
  dominantExpiryStale = false,
}: GammaCardProps) {
  const colors = useColors();
  const isShort = state === "SHORT";
  const isTransition = state === "TRANSITION";
  const stateColor = isShort ? colors.primary : isTransition ? colors.gold : colors.success;
  const absLevel = Math.abs(level);
  const barWidth = `${absLevel}%` as const;
  const staleSuffix = " (desactualizado)";

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GAMMA EXPOSURE</Text>
      </View>

      <View style={styles.barContainer}>
        <View style={[styles.barTrack, { backgroundColor: colors.secondary }]}>
          <View
            style={[
              styles.barFill,
              {
                width: barWidth,
                backgroundColor: stateColor,
                alignSelf: isShort ? "flex-start" : "flex-end",
              },
            ]}
          />
        </View>
        <View style={styles.barLabels}>
          <Text style={[styles.barLabel, { color: colors.success }]}>LONG</Text>
          <Text style={[styles.barLevel, { color: stateColor }]}>{level}</Text>
          <Text style={[styles.barLabel, { color: colors.primary }]}>SHORT</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {!hideNetGamma && (
          <>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>GAMMA NETA</Text>
              <Text style={[styles.statValue, { color: stateColor }]}>
                {netGamma}
                {netGammaStale ? staleSuffix : ""}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          </>
        )}
        <View style={styles.statItem}>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>FLIP POINT</Text>
          <Text style={[styles.statValue, { color: colors.gold }]}>
            {flipPoint || "No disponible"}
            {flipPointStale ? staleSuffix : ""}
          </Text>
        </View>
        {dominantExpiry ? (
          <>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>EXP. DOMINANTE</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {dominantExpiry}
                {dominantExpiryStale ? staleSuffix : ""}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {description ? (
        <Text style={[styles.description, { borderTopColor: colors.border, color: colors.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
  },
  barContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  barFill: {
    height: 5,
    borderRadius: 3,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabel: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  barLevel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
  },
  statLabel: {
    fontSize: 7,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    marginBottom: 3,
    textAlign: "center",
  },
  statValue: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  description: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    padding: 12,
    borderTopWidth: 1,
  },
});
