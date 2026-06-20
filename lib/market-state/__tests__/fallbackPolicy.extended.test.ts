import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "@/lib/market-state/__tests__/fixtures";
import { resolveMarketStateSource } from "@/lib/market-state/fallbackPolicy";
import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";

describe("fallbackPolicy extended", () => {
  const snapshot = createBothModeEnvelopeFixture();

  it("32. Feature flag OFF uses legacy", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: false,
        sessionStatus: "authenticated",
        v2Data: snapshot,
        v2IsLoading: false,
        v2ErrorCode: null,
        legacyEnabled: true,
      }),
    ).toBe("legacy");
  });

  it("33. 500 sin snapshot usa legacy", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: null,
        v2IsLoading: false,
        v2ErrorCode: MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE,
        legacyEnabled: true,
      }),
    ).toBe("legacy");
  });

  it("34. 500 con snapshot conserva v2", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: snapshot,
        v2IsLoading: false,
        v2ErrorCode: MOBILE_V2_ERROR_CODES.MARKET_STATE_UNAVAILABLE,
        legacyEnabled: true,
      }),
    ).toBe("v2");
  });

  it("35. 401 no usa legacy", () => {
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

  it("36. 403 no usa legacy", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: null,
        v2IsLoading: false,
        v2ErrorCode: MOBILE_V2_ERROR_CODES.PLAN_REQUIRED,
        legacyEnabled: true,
      }),
    ).toBe("v2");
  });

  it("37. Validation error conserva snapshot previo", () => {
    expect(
      resolveMarketStateSource({
        v2FeatureEnabled: true,
        sessionStatus: "authenticated",
        v2Data: snapshot,
        v2IsLoading: false,
        v2ErrorCode: "VALIDATION_ERROR",
        legacyEnabled: true,
      }),
    ).toBe("v2");
  });
});
