import { describe, expect, it } from "vitest";

import {
  isLegacyHomeReady,
  isSpotUsable,
  isV2HomeReady,
  resolveIsHomeReady,
} from "@/lib/market-state/homeReadiness";

describe("homeReadiness", () => {
  it("requires usable spot for v2 readiness", () => {
    expect(
      isV2HomeReady({
        data: {},
        micro: {} as never,
        macro: {} as never,
        spot: { value: 82000, status: "available" },
      }),
    ).toBe(true);

    expect(
      isV2HomeReady({
        data: {},
        micro: {} as never,
        macro: {} as never,
        spot: { value: null, status: "unavailable" },
      }),
    ).toBe(false);
  });

  it("does not unlock v2 home from legacy cache alone", () => {
    expect(
      resolveIsHomeReady({
        v2Enabled: true,
        marketStateSource: "v2",
        v2: {
          data: null,
          micro: null,
          macro: null,
          spot: null,
        },
        legacyMarket: { market: { spot: 82000 } },
      }),
    ).toBe(false);
  });

  it("allows legacy home when legacy is the active source", () => {
    expect(
      resolveIsHomeReady({
        v2Enabled: true,
        marketStateSource: "legacy",
        v2: {
          data: null,
          micro: null,
          macro: null,
          spot: null,
        },
        legacyMarket: { market: { spot: 82000 } },
      }),
    ).toBe(true);
  });

  it("validates legacy spot", () => {
    expect(isLegacyHomeReady({ market: { spot: 82000 } })).toBe(true);
    expect(isLegacyHomeReady({ market: { spot: null } })).toBe(false);
  });

  it("rejects unavailable spot", () => {
    expect(isSpotUsable({ value: 82000, status: "unavailable" })).toBe(false);
  });
});
