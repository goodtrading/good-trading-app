import { useGetMarketState } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { MOBILE_STATE_V2_ENABLED } from "@/lib/feature-flags";
import { resolveMarketStateSource } from "@/lib/market-state/fallbackPolicy";
import { useMobileMarketStateV2 } from "@/hooks/useMobileMarketStateV2";

/**
 * Gradual migration wrapper.
 * Phase B/C: when v2 flag is on, prefer v2 but keep legacy polling for comparison/fallback.
 */
export function useMarketStateWithFallback(asset = "BTC") {
  const v2Enabled = Boolean(MOBILE_STATE_V2_ENABLED);
  const { sessionStatus } = useAuth();

  const legacyQuery = useGetMarketState({
    query: {
      enabled: true,
      queryKey: ["market-state", "legacy"],
      refetchInterval: v2Enabled ? 15_000 : 7_000,
      staleTime: 5_000,
    },
  });

  const v2 = useMobileMarketStateV2({
    asset,
    enabled: v2Enabled,
  });

  const source = resolveMarketStateSource({
    v2FeatureEnabled: v2Enabled,
    sessionStatus,
    v2Data: v2.data,
    v2IsLoading: v2.isLoading,
    v2ErrorCode: v2.error?.code ?? null,
    legacyEnabled: true,
  });

  if (__DEV__ && v2Enabled && v2.data && legacyQuery.data && source === "v2") {
    const legacy = legacyQuery.data as unknown as Record<string, unknown>;
    const legacySpot = (legacy as { market?: { spot?: unknown } })?.market?.spot;
    const v2Spot = v2.spot?.value;
    if (legacySpot != null && v2Spot != null) {
      console.log("[MarketState migration] spot compare", { legacySpot, v2Spot });
    }
  }

  return {
    source,
    v2Enabled,
    legacy: legacyQuery,
    v2,
    sessionStatus,
    authLoading: Boolean(v2.authLoading),
    requiresAuth: Boolean(v2.requiresAuth),
    unauthorized: Boolean(v2.unauthorized),
    subscriptionRequired: Boolean(v2.subscriptionRequired),
  };
}
