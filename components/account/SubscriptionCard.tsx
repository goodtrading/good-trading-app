import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import type { SubscriptionViewModel } from "@/lib/account/subscriptionView";

type SubscriptionCardProps = {
  subscription: SubscriptionViewModel;
  onUpgradePress: () => void;
  onManagePress: () => void;
  onReactivatePress: () => void;
};

function toneColor(
  tone: SubscriptionViewModel["statusTone"],
  colors: ReturnType<typeof useColors>,
): string {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "danger") return colors.primary;
  return colors.mutedForeground;
}

export function SubscriptionCard({
  subscription,
  onUpgradePress,
  onManagePress,
  onReactivatePress,
}: SubscriptionCardProps) {
  const colors = useColors();
  const statusColor = toneColor(subscription.statusTone, colors);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Mi suscripción</Text>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {subscription.statusLabel.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={[styles.plan, { color: colors.foreground }]}>{subscription.planLabel}</Text>
        {subscription.billingCycleLabel ? (
          <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
            Ciclo: {subscription.billingCycleLabel}
          </Text>
        ) : null}
        {subscription.renewalLabel ? (
          <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
            Renovación: {subscription.renewalLabel}
          </Text>
        ) : null}
        {subscription.accessUntilLabel ? (
          <Text style={[styles.metaLine, { color: colors.warning }]}>
            Acceso hasta: {subscription.accessUntilLabel}
          </Text>
        ) : null}
        {subscription.helperText ? (
          <Text style={[styles.helper, { color: colors.secondaryForeground }]}>
            {subscription.helperText}
          </Text>
        ) : null}
      </View>

      {subscription.showUpgradeCta ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={onUpgradePress}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Ver GoodTrading Pro</Text>
          <Feather name="arrow-right" size={14} color="#ffffff" />
        </TouchableOpacity>
      ) : null}

      {subscription.showManageCta ? (
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.border }]}
          onPress={onManagePress}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
            Gestionar suscripción
          </Text>
          <Feather name="external-link" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}

      {subscription.showReactivateCta ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={onReactivatePress}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Reactivar plan</Text>
          <Feather name="refresh-cw" size={14} color="#ffffff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
  meta: {
    marginBottom: 12,
    gap: 4,
  },
  plan: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  metaLine: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  helper: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 2,
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 2,
    borderWidth: 1,
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
});
