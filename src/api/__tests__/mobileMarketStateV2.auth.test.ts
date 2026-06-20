import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBothModeRawEnvelopeFixture } from "@/lib/market-state/__tests__/fixtures";
import { setAuthTokenGetter, setBaseUrl } from "@/lib/api-client/custom-fetch";
import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";
import { configureMobileMarketStateV2Auth, getMobileMarketStateV2Url } from "@/src/api/mobileMarketStateV2";

describe("mobileMarketStateV2 auth wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    setBaseUrl("https://api.example.com");
    configureMobileMarketStateV2Auth(async () => "test-bearer-token");
  });

  afterEach(() => {
    configureMobileMarketStateV2Auth(null);
    setBaseUrl(null);
    vi.unstubAllGlobals();
  });

  it("5. Authorization Bearer header is attached", async () => {
    const envelope = createBothModeRawEnvelopeFixture();
    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const { fetchMobileMarketStateV2 } = await import("@/src/api/mobileMarketStateV2");
    const snapshot = await fetchMobileMarketStateV2();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-bearer-token");
    expect(snapshot.meta.requestId).toBe("req-1");
    expect(snapshot.meta.snapshotId).toBe("snap-1");
    expect(snapshot.data.asset.spot.value).toBe(85_180.4);
  });

  it("6. diagnostics path does not include JWT from getter", async () => {
    const getter = vi.fn().mockResolvedValue("super-secret-jwt");
    setAuthTokenGetter(getter);

    const token = await getter();
    const diagnostics = {
      requestId: "r1",
      snapshotId: "s1",
      httpStatus: 200,
    };

    expect(JSON.stringify(diagnostics)).not.toContain(token);
    expect(JSON.stringify(diagnostics)).not.toContain("Bearer");
  });

  it("20. production URL base uses EXPO_PUBLIC_DOMAIN pattern", () => {
    setBaseUrl("https://goodtrading.up.railway.app");
    expect(getMobileMarketStateV2Url("BTC", "both")).toBe(
      "/api/mobile/market-state/v2?asset=BTC&mode=both",
    );
  });

  it("1. getter returns null when auth cleared", async () => {
    configureMobileMarketStateV2Auth(async () => null);

    const fetchMock = vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          code: "UNAUTHORIZED",
          message: "unauthorized",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const { fetchMobileMarketStateV2 } = await import("@/src/api/mobileMarketStateV2");
    await expect(fetchMobileMarketStateV2()).rejects.toMatchObject({
      code: MOBILE_V2_ERROR_CODES.AUTH_REQUIRED,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
  });
});
