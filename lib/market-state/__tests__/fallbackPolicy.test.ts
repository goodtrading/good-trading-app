import { describe, expect, it } from "vitest";

import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";
import {
  isAuthRequiredError,
  isSubscriptionRequiredError,
  shouldStopV2PollingOnError,
} from "@/src/api/mobileMarketStateV2";
import { resolveMarketStateSource, shouldPollV2MarketState } from "@/lib/market-state/fallbackPolicy";

describe("fallback policy", () => {
  it("15. feature flag off keeps legacy", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: false,
        sessionStatus: "authenticated",
        v2Data: null,
        v2IsLoading: false,
        v2ErrorCode: null,
        legacyEnabled: true,
      }),
    ).toBe("legacy");
  });

  it("16. feature flag on and v2 data selects v2", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: { meta: {}, data: {} },
        v2IsLoading: false,
        v2ErrorCode: null,
        legacyEnabled: true,
      }),
    ).toBe("v2");
  });

  it("17. AUTH_REQUIRED is not hidden by legacy fallback", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: null,
        v2IsLoading: false,
        v2ErrorCode: MOBILE_V2_ERROR_CODES.AUTH_REQUIRED,
        legacyEnabled: true,
      }),
    ).toBe("v2");
  });

  it("18. auth loading does not select legacy or v2 fetch source", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "loading",
        v2Data: null,
        v2IsLoading: false,
        v2ErrorCode: null,
        legacyEnabled: true,
      }),
    ).toBe("none");
  });

  it("3. no v2 polling during auth hydration", () => {
    expect(shouldPollV2MarketState(true, "loading")).toBe(false);
  });

  it("7. authenticated session allows v2 polling", () => {
    expect(shouldPollV2MarketState(true, "authenticated")).toBe(true);
  });

  it("12. PLAN_REQUIRED stops automatic polling retries", () => {
    expect(shouldStopV2PollingOnError(MOBILE_V2_ERROR_CODES.PLAN_REQUIRED)).toBe(true);
  });

  it("403 path does not stop polling for rate limits", () => {
    expect(shouldStopV2PollingOnError(MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED)).toBe(false);
  });

  it("maps auth and subscription helpers", () => {
    expect(isAuthRequiredError(MOBILE_V2_ERROR_CODES.AUTH_REQUIRED)).toBe(true);
    expect(isSubscriptionRequiredError(MOBILE_V2_ERROR_CODES.TERMINAL_ACCESS_DENIED)).toBe(true);
  });
});
