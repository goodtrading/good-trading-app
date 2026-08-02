import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { EditorialSectionTitle } from "@/components/EditorialSectionTitle";
import { editorial } from "@/constants/editorial";
import { useColors } from "@/hooks/useColors";

type DriverImpact = "high" | "medium" | "low";

type DriverTone = "positive" | "risk" | "transition" | "neutral";

type Driver = {
  label: string;
  impact: DriverImpact;
};

type Props = {
  drivers: Driver[];
};

function resolveDriverTone(impact: DriverImpact, label: string): DriverTone {
  const text = label.toUpperCase();

  if (impact === "high") return "risk";
  if (impact === "medium") return "transition";

  if (
    text.includes("MONITORING") ||
    text.includes("WAITING") ||
    text.includes("CLARITY") ||
    text.includes("NEUTRAL") ||
    text.includes("UNAVAILABLE")
  ) {
    return "neutral";
  }

  return "positive";
}

function getTonePalette(tone: DriverTone, colors: ReturnType<typeof useColors>) {
  switch (tone) {
    case "risk":
      return {
        text: colors.primary,
        border: "rgba(224, 30, 46, 0.72)",
        glow: colors.primary,
        background: "rgba(224, 30, 46, 0.08)",
      };
    case "transition":
      return {
        text: colors.warning,
        border: "rgba(255, 171, 0, 0.72)",
        glow: colors.warning,
        background: "rgba(255, 171, 0, 0.08)",
      };
    case "positive":
      return {
        text: colors.success,
        border: "rgba(0, 200, 83, 0.68)",
        glow: colors.success,
        background: "rgba(0, 200, 83, 0.08)",
      };
    default:
      return {
        text: colors.mutedForeground,
        border: "rgba(102, 102, 102, 0.72)",
        glow: colors.mutedForeground,
        background: "rgba(102, 102, 102, 0.08)",
      };
  }
}

export function DriversCard({ drivers }: Props) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <EditorialSectionTitle>Contexto</EditorialSectionTitle>

      {drivers.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Sin contexto activo</Text>
      ) : (
        <View style={styles.chipsWrap}>
          {drivers.map((driver) => {
            const tone = resolveDriverTone(driver.impact, driver.label);
            const palette = getTonePalette(tone, colors);

            return (
              <View
                key={driver.label}
                style={[
                  styles.chip,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.background,
                    ...Platform.select({
                      ios: {
                        shadowColor: palette.glow,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.22,
                        shadowRadius: 5,
                      },
                      android: {
                        elevation: 2,
                      },
                      default: {},
                    }),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: palette.text,
                    },
                  ]}
                >
                  {driver.label.toUpperCase()}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: editorial.rowGap - 2,
  },
  empty: {
    fontSize: editorial.bodySize - 2,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  chipsWrap: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 7.5,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  chipText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.35,
    lineHeight: 14,
  },
});
