import { describe, expect, it } from "vitest";

import {
  buildZoneKey,
  findDuplicateZoneKeys,
  selectKeyZonesForScope,
} from "@/lib/market-state/keyZoneSelectors";
import {
  isTerminalMarketStatePayload,
  mapTerminalPayloadToMobileV2,
} from "@/lib/market-state/mapTerminalPayloadToMobileV2";
import { parseMobileMarketStateV2DataWithWarnings } from "@/lib/market-state/v2DataSchema";
import {
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
} from "@/lib/market-state/v2UiMappers";

const pocketItem = {
  id: "pocket-upper-69500-70500",
  type: "short_gamma_pocket",
  priceLow: 69500,
  priceHigh: 70500,
  price: 70000,
  status: "available",
};

function auditStage(label: string, zones: ReturnType<typeof mapKeyZonesFromMacro>) {
  const keys = zones.map((zone) => buildZoneKey(zone));
  const duplicates = findDuplicateZoneKeys(zones);
  return { label, zoneCount: zones.length, labels: zones.map((z) => z.label), keys, duplicates };
}

describe("key zone duplicate audit", () => {
  it("reproduces POCKET-UPPER-69500-70500 when pocket exists in magnets and shortGammaPockets", () => {
    const terminalPayload = {
      asset: { symbol: "BTC", spot: { value: 68000, status: "available" } },
      micro: {
        gamma: {
          flip: { price: { value: 67000, status: "available" }, distance: { signedDistancePct: 1, status: "available", position: "below_spot" } },
          regime: { value: "LONG_GAMMA", status: "available" },
          transitionZone: { start: { value: 66500, status: "available" }, end: { value: 67500, status: "available" } },
          gammaMagnets: { items: [], status: "available" },
          shortGammaPockets: { items: [], status: "available" },
        },
        scenarios: { items: [], status: "available" },
        bias: { label: { value: "NEUTRAL", status: "available" } },
        risk: { volatility: { state: { value: "NORMAL", status: "available" } } },
        optionsStructure: {},
      },
      macro: {
        gamma: {
          flip: { price: { value: 69000, status: "available" } },
          regime: { value: "SHORT_GAMMA", status: "available" },
          totalGex: { value: -1000, status: "available" },
          dealerPivot: { price: 68500, status: "available" },
          dominantExpiry: { instrumentCode: "BTC-20JUN26", status: "available" },
          gammaMagnets: { items: [pocketItem], status: "available" },
          shortGammaPockets: { items: [pocketItem], status: "available" },
        },
        scenarios: { items: [], status: "available" },
        optionsStructure: {
          callWall: { price: 72000, status: "available" },
          putWall: { price: 64000, status: "available" },
          dealerPivot: { price: 68500, status: "available" },
          gammaMagnets: { items: [], status: "available" },
          shortGammaPockets: { items: [], status: "available" },
          dominantExpiry: { instrumentCode: "BTC-20JUN26", daysToExpiry: 3, status: "available" },
        },
      },
      relationship: {
        descriptionCode: { value: "REGIME_DIVERGENT", status: "available" },
        regimeAlignment: { value: "divergent", status: "available" },
        flipOrdering: { value: "local_below_global", status: "available" },
        conflictLevel: { value: "medium", status: "available" },
        biasAlignment: { value: "mixed", status: "available" },
        tradeImplication: { value: "wait", status: "available" },
      },
      alerts: [],
    };

    expect(isTerminalMarketStatePayload(terminalPayload)).toBe(true);

    const mapped = mapTerminalPayloadToMobileV2(terminalPayload) as {
      macro: {
        structuralMagnets: Array<{ label: string | null }>;
        shortGammaPockets: Array<{ label: string | null }>;
      };
    };

    const mapperZones = mapKeyZonesFromMacro(
      parseMobileMarketStateV2DataWithWarnings(terminalPayload).data.macro,
      68000,
    );
    const selectorZones = selectKeyZonesForScope({
      mode: "Macro",
      micro: parseMobileMarketStateV2DataWithWarnings(terminalPayload).data.micro,
      macro: parseMobileMarketStateV2DataWithWarnings(terminalPayload).data.macro,
      spot: 68000,
    });

    const mapperAudit = auditStage("mapKeyZonesFromMacro", mapperZones);
    const selectorAudit = auditStage("selectKeyZonesForScope", selectorZones);

    expect(mapped.macro.structuralMagnets.some((item) => item.label === "pocket-upper-69500-70500")).toBe(false);
    expect(mapped.macro.shortGammaPockets.some((item) => item.label === "pocket-upper-69500-70500")).toBe(true);
    expect(mapperAudit.duplicates).toEqual([]);
    expect(selectorAudit.duplicates).toEqual([]);
  });

  it("does not duplicate when pocket only exists in shortGammaPockets", () => {
    const terminalPayload = {
      asset: { symbol: "BTC", spot: { value: 68000, status: "available" } },
      micro: {
        gamma: {
          flip: { price: { value: 67000, status: "available" }, distance: { signedDistancePct: 1, status: "available", position: "below_spot" } },
          regime: { value: "LONG_GAMMA", status: "available" },
          transitionZone: { start: { value: 66500, status: "available" }, end: { value: 67500, status: "available" } },
          gammaMagnets: { items: [], status: "available" },
          shortGammaPockets: { items: [], status: "available" },
        },
        scenarios: { items: [], status: "available" },
        bias: { label: { value: "NEUTRAL", status: "available" } },
        risk: { volatility: { state: { value: "NORMAL", status: "available" } } },
        optionsStructure: {},
      },
      macro: {
        gamma: {
          flip: { price: { value: 69000, status: "available" } },
          regime: { value: "SHORT_GAMMA", status: "available" },
          totalGex: { value: -1000, status: "available" },
          dealerPivot: { price: 68500, status: "available" },
          dominantExpiry: { instrumentCode: "BTC-20JUN26", status: "available" },
          gammaMagnets: { items: [], status: "available" },
          shortGammaPockets: { items: [pocketItem], status: "available" },
        },
        scenarios: { items: [], status: "available" },
        optionsStructure: {
          callWall: { price: 72000, status: "available" },
          putWall: { price: 64000, status: "available" },
          dealerPivot: { price: 68500, status: "available" },
          gammaMagnets: { items: [], status: "available" },
          shortGammaPockets: { items: [], status: "available" },
          dominantExpiry: { instrumentCode: "BTC-20JUN26", daysToExpiry: 3, status: "available" },
        },
      },
      relationship: {
        descriptionCode: { value: "REGIME_DIVERGENT", status: "available" },
        regimeAlignment: { value: "divergent", status: "available" },
        flipOrdering: { value: "local_below_global", status: "available" },
        conflictLevel: { value: "medium", status: "available" },
        biasAlignment: { value: "mixed", status: "available" },
        tradeImplication: { value: "wait", status: "available" },
      },
      alerts: [],
    };

    const zones = mapKeyZonesFromMacro(
      parseMobileMarketStateV2DataWithWarnings(terminalPayload).data.macro,
      68000,
    );
    expect(findDuplicateZoneKeys(zones)).toEqual([]);
  });
});
