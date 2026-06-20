import type { AuthAccess, AuthUser } from "@/lib/auth/types";

import {
  resolveSubscriptionView,
  shouldShowFullPaywall,
  type SubscriptionPlanState,
  type SubscriptionViewModel,
} from "./subscriptionView";

export type AccountScreenModel = {
  subscription: SubscriptionViewModel;
  showPaywallEntry: boolean;
  showFullPaywallOnUpgrade: boolean;
  accountStatusLabel: string;
};

export function buildAccountScreenModel(args: {
  user: AuthUser | null;
  access: AuthAccess | null;
  saasDisabled: boolean;
  isAuthenticated: boolean;
}): AccountScreenModel {
  const subscription = resolveSubscriptionView(args);

  return {
    subscription,
    showPaywallEntry: subscription.showUpgradeCta,
    showFullPaywallOnUpgrade: shouldShowFullPaywall(subscription.planState),
    accountStatusLabel: subscription.statusLabel,
  };
}

export function isProPlanState(planState: SubscriptionPlanState): boolean {
  return planState === "pro_active";
}

export function sanitizeDisplayValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}
