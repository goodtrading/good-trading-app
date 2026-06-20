import { describe, expect, it } from "vitest";

import { auditProductionPayloadStructure, __testOnlyExpectedFieldSearch } from "@/lib/market-state/v2ProductionPayloadStructureAudit";

describe("v2ProductionPayloadStructureAudit", () => {
  it("walks nested production blocks without throwing", () => {
    const payload = {
      asset: { symbol: "BTC", spot: { value: 63319.57, status: "available" } },
      micro: {
        context: { scope: "micro", label: "Intraday" },
        horizon: { type: "INTRADAY" },
        gamma: {
          regime: { value: "SHORT_GAMMA", status: "available" },
          flip: { value: 65000, status: "available" },
          totalGex: { value: -1200000, status: "available" },
        },
        marketState: {
          mode: { value: "FRAGILE_TRANSITION", status: "available" },
        },
        bias: { type: { value: "FRAGILE_TRANSITION", status: "available" } },
        risk: { intradayRisk: { value: "HIGH", status: "available" } },
        scenarios: {
          base: { code: "BASE", title: "Range", thesis: "Mean reversion", status: "available" },
          items: [{ code: "ALT", title: "Breakout", thesis: "Upside", status: "available" }],
        },
        optionsStructure: {
          callWall: { value: 71000, status: "available" },
          putWall: { value: 59000, status: "available" },
          dealerPivot: { value: 65000, status: "available" },
          dominantExpiry: {
            date: "2026-06-20",
            instrumentCode: "BTC-20JUN26",
            daysToExpiry: 1,
            status: "available",
          },
          magnets: [{ price: 67000, label: "Magnet", status: "available" }],
          pockets: [{ price: 64800, label: "Pocket", status: "available" }],
        },
        quality: { confidence: 53 },
      },
      macro: {
        context: { scope: "macro", label: "Structural" },
        horizon: { type: "MULTI_DAY" },
        gamma: {
          regime: { value: "SHORT_GAMMA", status: "available" },
          flip: { value: 66042, status: "available" },
          totalGex: { value: -2200000000, status: "available" },
        },
        marketState: {
          mode: { value: "FRAGILE_TRANSITION", status: "available" },
        },
        bias: { type: { value: "FRAGILE_TRANSITION", status: "available" } },
        risk: { structuralRisk: { value: "HIGH", status: "available" } },
        scenarios: {
          structural: [{ code: "MACRO_BASE", title: "Base", thesis: "Structural", status: "available" }],
          tail: [{ code: "TAIL", title: "Tail", thesis: "Vol", status: "available" }],
        },
        optionsStructure: {
          callWall: { value: 88000, status: "available" },
          putWall: { value: 80000, status: "available" },
          dealerPivot: { value: 84200, status: "available" },
          dominantExpiry: {
            date: "2026-06-27",
            instrumentCode: "BTC-27JUN26",
            daysToExpiry: 8,
            status: "available",
          },
          magnets: [{ price: 90000, label: "Structural magnet", status: "available" }],
          pockets: [{ price: 87000, label: "Structural pocket", status: "available" }],
        },
        quality: { confidence: 53 },
      },
      relationship: {
        status: "available",
        regimeAlignment: { value: "aligned", status: "available" },
        microRegime: { value: "SHORT_GAMMA", status: "available" },
        macroRegime: { value: "SHORT_GAMMA", status: "available" },
        descriptionCode: { value: "REGIME_ALIGNED", status: "available" },
      },
      alerts: [],
    };

    expect(() => auditProductionPayloadStructure(payload, 99)).not.toThrow();
    expect(Object.keys(__testOnlyExpectedFieldSearch).length).toBeGreaterThan(10);
  });
});
