import { describe, expect, it } from "vitest";

import {
  filterIncrementalDrivers,
  type IncrementalDriverFilterContext,
} from "@/lib/market-state/incrementalDrivers";

const baseCtx: IncrementalDriverFilterContext = {
  regime: "SHORT GAMMA",
  marketMode: "FRAGILE TRANSITION",
  confidence: 53,
  setup: "Volatility expansion risk",
  transitionZone: "84,000 - 85,000",
  scope: "Micro",
  zoneLabels: ["Local Flip", "Imanes Cercanos", "Short Gamma Pocket"],
};

describe("filterIncrementalDrivers", () => {
  it("removes only exact duplicates of header regime", () => {
    expect(filterIncrementalDrivers(["SHORT GAMMA", "LONG GAMMA"], baseCtx)).toEqual(["LONG GAMMA"]);
  });

  it("removes exact duplicate of market mode", () => {
    expect(filterIncrementalDrivers(["FRAGILE TRANSITION", "VANNA CHARM ACCEL"], baseCtx)).toEqual([
      "VANNA CHARM ACCEL",
    ]);
  });

  it("keeps complementary regime and flip drivers", () => {
    const input = [
      "BETWEEN GAMMA REGIMES",
      "NEAR GAMMA FLIP",
      "INSTITUTIONAL BIAS FRAGILE",
      "DEALER HEDGING ASYMMETRY",
    ];
    expect(filterIncrementalDrivers(input, baseCtx)).toEqual(input.map((d) => d.toUpperCase()));
  });

  it("keeps low confidence even when header shows confidence", () => {
    expect(filterIncrementalDrivers(["LOW CONFIDENCE", "PUT SKEW BUILD"], baseCtx)).toEqual([
      "LOW CONFIDENCE",
      "PUT SKEW BUILD",
    ]);
  });

  it("deduplicates normalized labels", () => {
    expect(filterIncrementalDrivers(["VANNA ACCEL", "vanna_accel"], baseCtx)).toEqual(["VANNA ACCEL"]);
  });
});
