import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";
import type { AuthSessionStatus } from "@/lib/auth";
import {
  isAuthRequiredError,
  isSubscriptionRequiredError,
  type MobileMarketStateV2ClientErrorCode,
} from "@/src/api/mobileMarketStateV2";

export type MarketStateSource = "v2" | "legacy" | "none";

export type ResolveMarketStateSourceInput = {
  v2FeatureEnabled: boolean;
  sessionStatus: AuthSessionStatus;
  v2Data: unknown | null;
  v2IsLoading: boolean;
  v2ErrorCode: MobileMarketStateV2ClientErrorCode | null;
  legacyEnabled: boolean;
};

/**
 * Determines which market-state source the UI should prefer.
 * Auth/plan errors from v2 must not be masked by legacy fallback.
 */
export function resolveMarketStateSource(input: ResolveMarketStateSourceInput): MarketStateSource {
  const { v2FeatureEnabled, sessionStatus, v2Data, v2IsLoading, v2ErrorCode, legacyEnabled } =
    input;

  if (!v2FeatureEnabled) {
    return legacyEnabled ? "legacy" : "none";
  }

  if (sessionStatus === "loading") {
    return "none";
  }

  if (
    v2ErrorCode != null &&
    (isAuthRequiredError(v2ErrorCode) || isSubscriptionRequiredError(v2ErrorCode))
  ) {
    return "v2";
  }

  if (v2Data != null) {
    return "v2";
  }

  if (sessionStatus === "authenticated" && (v2IsLoading || v2ErrorCode == null)) {
    return v2IsLoading ? "v2" : legacyEnabled ? "legacy" : "v2";
  }

  if (sessionStatus === "unauthenticated") {
    return legacyEnabled ? "legacy" : "none";
  }

  if (
    v2ErrorCode === MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE ||
    v2ErrorCode === "NETWORK_ERROR"
  ) {
    return legacyEnabled ? "legacy" : "v2";
  }

  return v2IsLoading ? "v2" : legacyEnabled ? "legacy" : "none";
}

export function shouldPollV2MarketState(
  enabled: boolean,
  sessionStatus: AuthSessionStatus,
): boolean {
  return enabled && sessionStatus === "authenticated";
}
