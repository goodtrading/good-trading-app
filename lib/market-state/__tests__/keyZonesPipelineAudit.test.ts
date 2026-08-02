import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "./fixtures";
import { parseMobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";
import {
  auditKeyZonesPipeline,
  resolveStableKeyZonesBranch,
} from "@/lib/market-state/keyZonesPipelineAudit";
import { selectKeyZonesForScope } from "@/lib/market-state/keyZoneSelectors";
import { mapKeyZonesFromMacro, mapKeyZonesFromMicro } from "@/lib/market-state/v2UiMappers";

const legacyFallback = [
  { label: "Call Wall", price: "$88,000", type: "resistance" as const, distance: "—" },
  { label: "Put Wall", price: "$80,000", type: "support" as const, distance: "—" },
];

describe("key zones pipeline audit", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const { micro, macro } = snapshot.data;
  const spot = snapshot.data.asset.spot.value;

  it("mappers emit full v2 zone sets from fixture payload", () => {
    const microZones = mapKeyZonesFromMicro(micro, spot);
    const macroZones = mapKeyZonesFromMacro(macro, spot);

    expect(microZones.length).toBeGreaterThanOrEqual(1);
    expect(macroZones.length).toBeGreaterThan(2);
    expect(microZones[0]?.label).toBe("Local Flip");
    expect(microZones.some((z) => z.label.toUpperCase().includes("TRANSITION"))).toBe(false);
    expect(macroZones[0]?.label).toBe("Global Flip");
    expect(macroZones.some((z) => z.label === "Dealer Pivot")).toBe(true);
  });

  it("legacy fallback is exactly Call Wall + Put Wall (matches app symptom)", () => {
    expect(legacyFallback).toHaveLength(2);
    expect(legacyFallback.map((z) => z.label)).toEqual(["Call Wall", "Put Wall"]);
  });

  it("useStableKeyZones legacy branch reproduces app output", () => {
    const branch = resolveStableKeyZonesBranch({
      enabled: false,
      mode: "Macro",
      micro,
      macro,
      spot,
      fallbackZones: legacyFallback,
      previousCache: [],
    });

    expect(branch.branch).toBe("legacy-fallback");
    expect(branch.zones).toHaveLength(2);
    expect(branch.zones.map((z) => z.label)).toEqual(["Call Wall", "Put Wall"]);
  });

  it("stale-cache branch can mask v2 when enabled but context missing", () => {
    const branch = resolveStableKeyZonesBranch({
      enabled: true,
      mode: "Macro",
      micro: null,
      macro: null,
      spot,
      fallbackZones: legacyFallback,
      previousCache: legacyFallback,
    });

    expect(branch.branch).toBe("stale-cache-while-v2-context-missing");
    expect(branch.zones.map((z) => z.label)).toEqual(["Call Wall", "Put Wall"]);
  });

  it("v2 branch emits Global Flip and Dealer Pivot for Macro", () => {
    const branch = resolveStableKeyZonesBranch({
      enabled: true,
      mode: "Macro",
      micro,
      macro,
      spot,
      fallbackZones: legacyFallback,
      previousCache: legacyFallback,
    });

    expect(branch.branch).toBe("v2-selector");
    expect(branch.zones[0]?.label).toBe("Global Flip");
    expect(branch.zones.some((z) => z.label === "Dealer Pivot")).toBe(true);
    expect(branch.zones.some((z) => z.label === "Call Wall")).toBe(true);
  });

  it("sanitized real fixture parses and maps all flip fields", () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(__dirname, "fixtures/mobileMarketStateV2.real.sanitized.json"),
        "utf8",
      ),
    );
    const parsed = parseMobileMarketStateV2Snapshot(raw);
    const macroZones = mapKeyZonesFromMacro(parsed.data.macro, parsed.data.asset.spot.value);

    const audit = auditKeyZonesPipeline({
      mode: "Macro",
      micro: parsed.data.micro,
      macro: parsed.data.macro,
      spot: parsed.data.asset.spot.value,
      legacyFallback,
      useV2Enabled: true,
      stableHookOutput: macroZones,
    });

    expect(audit.counts.mapperMacro).toBeGreaterThan(2);
    expect(audit.mapperMacro[0]?.label).toBe("Global Flip");
    expect(audit.payloadFields.find((f) => f.field === "macro.globalGammaFlip")?.status).toBe(
      "available",
    );
  });

  it("selector path matches mapper for active mode", () => {
    const selected = selectKeyZonesForScope({ mode: "Micro", micro, macro, spot });
    const mapped = mapKeyZonesFromMicro(micro, spot);
    expect(selected).toEqual(mapped);
  });
});
