import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { SubscriptionPlanState } from "@/lib/account/subscriptionView";

type PlanBadgeProps = {
  planLabel: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "muted" | "danger";
  planState: SubscriptionPlanState;
};

export function PlanBadge({ planLabel, statusLabel, statusTone }: PlanBadgeProps) {
  const colors = useColors();

  const statusColor =
    statusTone === "success"
      ? colors.success
      : statusTone === "warning"
        ? colors.warning
        : statusTone === "danger"
          ? colors.primary
          : colors.mutedForeground;

  return (
    <View style={styles.row}>
      <Text style={[styles.plan, { color: colors.foreground }]}>{planLabel.toUpperCase()}</Text>
      <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
      <Text style={[styles.status, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  plan: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  dot: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  status: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
});
