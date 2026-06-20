import { describe, expect, it } from "vitest";

import {
  formatRegimeForHeader,
  resolveHeaderRegimeFromV2,
  resolveRegimeTextColor,
  resolveHeaderRegimeTone,
} from "@/lib/market-state/headerRegimeView";

describe("headerRegimeView", () => {
  it("maps micro localRegime LONG_GAMMA to LONG GAMMA", () => {
    const result = resolveHeaderRegimeFromV2({
      scope: "Micro",
      micro: {
        localRegime: { value: "LONG_GAMMA", status: "available" },
      } as never,
      macro: null,
      fallbackLabel: "SHORT GAMMA",
      useV2Regime: true,
    });

    expect(result.displayedRegime).toBe("LONG GAMMA");
    expect(result.microRegime).toBe("LONG_GAMMA");
  });

  it("maps macro globalRegime SHORT_GAMMA to SHORT GAMMA", () => {
    const result = resolveHeaderRegimeFromV2({
      scope: "Macro",
      micro: null,
      macro: {
        globalRegime: { value: "SHORT_GAMMA", status: "available" },
      } as never,
      fallbackLabel: "LONG GAMMA",
      useV2Regime: true,
    });

    expect(result.displayedRegime).toBe("SHORT GAMMA");
    expect(result.macroRegime).toBe("SHORT_GAMMA");
  });

  it("returns REGIME UNAVAILABLE when status is unavailable", () => {
    expect(
      formatRegimeForHeader({
        value: "LONG_GAMMA",
        status: "unavailable",
      }),
    ).toBe("REGIME UNAVAILABLE");
  });

  it("falls back to legacy label when v2 regime is not active", () => {
    const result = resolveHeaderRegimeFromV2({
      scope: "Micro",
      micro: {
        localRegime: { value: "SHORT_GAMMA", status: "available" },
      } as never,
      macro: null,
      fallbackLabel: "TRANSITION GAMMA",
      useV2Regime: false,
    });

    expect(result.displayedRegime).toBe("TRANSITION GAMMA");
  });

  it("maps regime tone for header colors", () => {
    expect(resolveHeaderRegimeTone("LONG GAMMA")).toBe("long");
    expect(resolveHeaderRegimeTone("SHORT GAMMA")).toBe("short");
    expect(resolveHeaderRegimeTone("REGIME UNAVAILABLE")).toBe("unavailable");
  });

  it("maps long regime label to success color", () => {
    const color = resolveRegimeTextColor("LONG GAMMA", {
      success: "#00ff88",
      destructive: "#ff0033",
      mutedForeground: "#888888",
    });
    expect(color).toBe("#00ff88");
  });

  it("maps short regime label to destructive color", () => {
    const color = resolveRegimeTextColor("SHORT GAMMA", {
      success: "#00ff88",
      destructive: "#ff0033",
      mutedForeground: "#888888",
    });
    expect(color).toBe("#ff0033");
  });
});
