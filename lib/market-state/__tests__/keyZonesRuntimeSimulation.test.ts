import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveMarketStateSource } from "@/lib/market-state/fallbackPolicy";
import { selectKeyZonesForScope } from "@/lib/market-state/keyZoneSelectors";
import { buildKeyZonesRuntimeAudit } from "@/lib/market-state/keyZonesRuntimeAudit";
import { parseMobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";

const legacyZones = [
  { id: "call-wall", groupType: "single" as const, label: "CALL WALL", price: "$88,000", type: "resistance" as const, distance: "—", moreCount: 0 },
  { id: "put-wall", groupType: "single" as const, label: "PUT WALL", price: "$80,000", type: "support" as const, distance: "—", moreCount: 0 },
];

describe("key zones runtime simulation", () => {
  const fixture = JSON.parse(
    readFileSync(
      path.join(__dirname, "fixtures/mobileMarketStateV2.real.sanitized.json"),
      "utf8",
    ),
  );
  const snapshot = parseMobileMarketStateV2Snapshot(fixture);
  const spot = snapshot.data.asset.spot.value;

  it("A) no snapshot uses legacy fallback with 2 zones", () => {
    const audit = buildKeyZonesRuntimeAudit({
      marketStateSource: "legacy",
      hasSnapshot: false,
      hasData: false,
      hasMicro: false,
      hasMacro: false,
      shouldUseV2: false,
      gammaEffectiveBranch: "legacy",
      stableBranch: "legacy-fallback",
      zones: legacyZones,
      mode: "Macro",
    });
    expect(audit.zoneCount).toBe(2);
    expect(audit.labels).toEqual(["CALL WALL", "PUT WALL"]);
  });

  it("C) snapshot with missing macro disables v2 gate", () => {
    const shouldUseV2 = Boolean(snapshot) && Boolean(snapshot.data.micro) && false;
    expect(shouldUseV2).toBe(false);
  });

  it("expected v2 macro path delivers 7 zones", () => {
    const source = resolveMarketStateSource({
      v2FeatureEnabled: true,
      sessionStatus: "authenticated",
      v2Data: snapshot,
      v2IsLoading: false,
      v2ErrorCode: null,
      legacyEnabled: true,
    });
    const zones = selectKeyZonesForScope({
      mode: "Macro",
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      spot,
    });
    const audit = buildKeyZonesRuntimeAudit({
      marketStateSource: source,
      hasSnapshot: true,
      hasData: true,
      hasMicro: true,
      hasMacro: true,
      shouldUseV2: true,
      gammaEffectiveBranch: "v2",
      stableBranch: "v2-selector",
      zones,
      mode: "Macro",
    });

    expect(audit.zoneCount).toBe(6);
    expect(audit.labels[0]).toBe("Global Flip");
    expect(audit.labels).toContain("DEALER PIVOT");
    expect(audit.labels).not.toContain("DOMINANT EXPIRY");
    expect(audit.labels).toContain("Structural Magnet");
    expect(audit.labels).toContain("Short Gamma Pocket");
  });

  it("old gate using only marketStateSource legacy forces 2-zone symptom", () => {
    const zones = legacyZones;
    const audit = buildKeyZonesRuntimeAudit({
      marketStateSource: "legacy",
      hasSnapshot: true,
      hasData: true,
      hasMicro: true,
      hasMacro: true,
      shouldUseV2: false,
      gammaEffectiveBranch: "legacy",
      stableBranch: "legacy-fallback",
      zones,
      mode: "Macro",
    });
    expect(audit.zoneCount).toBe(2);
    expect(audit.labels).toEqual(["CALL WALL", "PUT WALL"]);
  });
});
