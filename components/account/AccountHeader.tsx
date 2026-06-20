import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getUserDisplayName, getUserInitials } from "@/lib/account/formatUser";
import type { AuthUser } from "@/lib/auth/types";
import type { SubscriptionViewModel } from "@/lib/account/subscriptionView";

import { PlanBadge } from "./PlanBadge";

type AccountHeaderProps = {
  user: AuthUser | null;
  subscription: SubscriptionViewModel;
};

export function AccountHeader({ user, subscription }: AccountHeaderProps) {
  const colors = useColors();
  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const email = user?.email?.trim();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[styles.initials, { color: colors.foreground }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.foreground }]}>{displayName}</Text>
          {email ? (
            <Text style={[styles.email, { color: colors.mutedForeground }]}>{email}</Text>
          ) : null}
          <PlanBadge
            planLabel={subscription.planLabel}
            statusLabel={subscription.statusLabel}
            statusTone={subscription.statusTone}
            planState={subscription.planState}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  email: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
