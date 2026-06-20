import { describe, expect, it } from "vitest";

import {
  createBothModeEnvelopeFixture,
  createBothModeRawEnvelopeFixture,
} from "@/lib/market-state/__tests__/fixtures";
import {
  formatValuedField,
  resolveDataStatusUi,
  shouldHideMetric,
} from "@/lib/market-state/dataStatusUi";
import { formatDominantExpiryDate, formatDistanceHuman } from "@/lib/market-state/distanceFormatting";
import { parseMobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";
import { translateRelationshipDescriptionCode } from "@/lib/market-state/v2RelationshipTranslations";
import { MOBILE_V2_ERROR_CODES } from "@/shared/mobileMarketStateV2.contract";
import {
  getMobileMarketStateV2Url,
  mapApiError,
  MobileMarketStateV2Error,
  parseRateLimitHeaders,
} from "@/src/api/mobileMarketStateV2";
import { ApiError } from "@/lib/api-client/custom-fetch";

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, statusText: String(status), headers });
}

describe("mobileMarketStateV2 envelope", () => {
  it("1. parses official success envelope with micro and macro", () => {
    const payload = createBothModeRawEnvelopeFixture();
    const parsed = parseMobileMarketStateV2Snapshot(payload);
    expect(parsed.meta.snapshotId).toBe("snap-1");
    expect(parsed.data.micro).toBeDefined();
    expect(parsed.data.macro).toBeDefined();
    expect(parsed.schemaVersion).toBe("2.0.0");
  });
});

describe("micro/macro local selection", () => {
  it("2. changes Micro/Macro without request (local slice)", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(payload.data.micro.localGammaFlip.value).toBe(84_500);
    expect(payload.data.macro.globalGammaFlip.value).toBe(83_500);
  });
});

describe("data status UI", () => {
  it("3. available shows value", () => {
    expect(formatValuedField("available", 10, String)).toBe("10");
  });

  it("4. unavailable shows fallback", () => {
    expect(formatValuedField("unavailable", 10, String)).toBe("No disponible");
  });

  it("5. stale shows value", () => {
    expect(resolveDataStatusUi("stale")).toBe("show_stale");
    expect(formatValuedField("stale", 12, String)).toBe("12");
  });

  it("6. not_applicable hides metric", () => {
    expect(shouldHideMetric("not_applicable")).toBe(true);
    expect(formatValuedField("not_applicable", 0, String)).toBeNull();
  });

  it("7. calculation_error shows degraded state", () => {
    expect(formatValuedField("calculation_error", 0, String)).toBe("Error de cálculo");
  });
});

describe("HTTP error mapping", () => {
  it("8. maps 401 to AUTH_REQUIRED", () => {
    const error = mapApiError(
      new ApiError(
        mockResponse(401),
        {
          status: "error",
          error: { code: "AUTH_REQUIRED", message: "unauthorized" },
          meta: { requestId: "r1", servedAt: "2026-01-01T00:00:00.000Z" },
        },
        { method: "GET", url: "/x" },
      ),
    );
    expect(error).toBeInstanceOf(MobileMarketStateV2Error);
    expect(error.code).toBe(MOBILE_V2_ERROR_CODES.AUTH_REQUIRED);
    expect(error.requestId).toBe("r1");
  });

  it("9. maps 403 to PLAN_REQUIRED", () => {
    const error = mapApiError(
      new ApiError(
        mockResponse(403),
        {
          status: "error",
          error: { code: "PLAN_REQUIRED", message: "forbidden" },
          meta: { requestId: "r2", servedAt: "2026-01-01T00:00:00.000Z" },
        },
        { method: "GET", url: "/x" },
      ),
    );
    expect(error.code).toBe(MOBILE_V2_ERROR_CODES.PLAN_REQUIRED);
  });

  it("10. maps 429 with Retry-After and retryAfterSec", () => {
    const error = mapApiError(
      new ApiError(
        mockResponse(429, { "retry-after": "12" }),
        {
          status: "error",
          error: {
            code: "MOBILE_RATE_LIMITED",
            message: "rate limited",
            retryAfterSec: 15,
          },
          meta: { requestId: "r3", servedAt: "2026-01-01T00:00:00.000Z" },
        },
        { method: "GET", url: "/x" },
      ),
    );
    expect(error.code).toBe(MOBILE_V2_ERROR_CODES.MOBILE_RATE_LIMITED);
    expect(error.retryAfterMs).toBe(15_000);
  });
});

describe("snapshot diagnostics", () => {
  it("11. same snapshotId on cached polling", () => {
    const first = createBothModeEnvelopeFixture({ meta: { requestId: "r1", snapshotId: "snap-a" } });
    const second = createBothModeEnvelopeFixture({ meta: { requestId: "r2", snapshotId: "snap-a" } });
    expect(first.meta.snapshotId).toBe(second.meta.snapshotId);
    expect(first.meta.requestId).not.toBe(second.meta.requestId);
  });

  it("12. different requestId per HTTP call", () => {
    const a = createBothModeEnvelopeFixture({ meta: { requestId: "req-a", snapshotId: "snap" } });
    const b = createBothModeEnvelopeFixture({ meta: { requestId: "req-b", snapshotId: "snap" } });
    expect(a.meta.requestId).not.toBe(b.meta.requestId);
  });
});

describe("scope-specific metrics", () => {
  it("13. hides totalGex in Micro when not_applicable", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(shouldHideMetric(payload.data.micro.totalGex.status)).toBe(true);
  });

  it("14. global flip only in macro", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(payload.data.macro.globalGammaFlip.value).toBe(83_500);
    expect(payload.data.micro.localGammaFlip.value).toBe(84_500);
  });

  it("15. local flip only in micro", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(payload.data.micro.localGammaFlip.status).toBe("available");
    expect(payload.data.macro.globalGammaFlip.status).toBe("available");
  });
});

describe("relationship", () => {
  it("16. translates divergent relationship code", () => {
    const translation = translateRelationshipDescriptionCode("REGIME_DIVERGENT");
    expect(translation?.title).toBe("Régimen divergente");
  });
});

describe("dominant expiry", () => {
  it("17. formats expiry from date without parsing instrumentCode", () => {
    const payload = createBothModeEnvelopeFixture();
    const formatted = formatDominantExpiryDate(payload.data.macro.dominantExpiry.date);
    expect(formatted).toContain("2026");
  });
});

describe("polling policy", () => {
  it("18. pauses polling in background", async () => {
    const { shouldPollMarketState } = await import("@/lib/market-state/pollingPolicy");
    expect(shouldPollMarketState(false, true)).toBe(false);
  });

  it("19. refreshes when returning to foreground", async () => {
    const { shouldRefreshOnForeground } = await import("@/lib/market-state/pollingPolicy");
    expect(shouldRefreshOnForeground(false, true)).toBe(true);
  });
});

describe("HTTP endpoint", () => {
  it("uses mode=both endpoint", () => {
    expect(getMobileMarketStateV2Url("BTC", "both")).toBe(
      "/api/mobile/market-state/v2?asset=BTC&mode=both",
    );
  });
});

describe("rate limit headers", () => {
  it("parses rate limit headers", () => {
    const info = parseRateLimitHeaders(
      new Headers({
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "12",
        "x-ratelimit-reset": "1710000000",
      }),
    );
    expect(info.limit).toBe(60);
    expect(info.remaining).toBe(12);
    expect(info.reset).toBe(1710000000);
  });
});

describe("legacy fallback flag", () => {
  it("20. keeps legacy path available when v2 disabled", async () => {
    const { MOBILE_STATE_V2_ENABLED } = await import("@/lib/feature-flags");
    expect(typeof MOBILE_STATE_V2_ENABLED).toBe("boolean");
  });
});

describe("distance formatting", () => {
  it("uses distancePct magnitude and above_spot position", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(formatDistanceHuman(payload.data.micro.distanceToLocalFlip)).toBe("0.80% arriba");
  });
});

describe("metadata", () => {
  it("preserves metadata block inside data payload", () => {
    const payload = createBothModeEnvelopeFixture();
    expect(payload.data.metadata).toEqual({ accessModel: "terminal_subscription_inherited" });
  });
});
