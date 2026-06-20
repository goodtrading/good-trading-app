import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "./fixtures";
import {
  areKeyZonesEqual,
  flipLabelForMode,
  KEY_ZONE_LABEL_GLOBAL_FLIP,
  KEY_ZONE_LABEL_LOCAL_FLIP,
  selectKeyZonesForScope,
  stabilizeKeyZones,
} from "@/lib/market-state/keyZoneSelectors";
import {
  KEY_ZONE_GROUP_NEARBY_MAGNET,
  KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
  KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
} from "@/lib/market-state/v2UiMappers";
import { MOBILE_STATE_V2_DEFAULT_MODE } from "@/lib/feature-flags";

describe("key zone flip integration", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;
  const { micro, macro } = snapshot.data;

  const richMicro = {
    ...micro,
    nearbyMagnets: [{ price: 85_500, label: "M1", status: "available" as const }],
    nearbyPockets: [{ price: 84_800, label: "P1", status: "available" as const }],
  };

  const richMacro = {
    ...macro,
    structuralMagnets: [{ price: 86_000, label: "SM1", status: "available" as const }],
    shortGammaPockets: [{ price: 82_500, label: "SGP1", status: "available" as const }],
    dominantExpiry: {
      date: "2026-06-20",
      instrumentCode: "BTC-20JUN26",
      daysToExpiry: 1,
      status: "available" as const,
    },
  };

  it("1. Local Flip visible in Micro", () => {
    const zones = mapKeyZonesFromMicro(richMicro, spot);
    expect(zones[0]?.label).toBe(KEY_ZONE_LABEL_LOCAL_FLIP);
    expect(zones[0]?.price).toContain("84,500");
  });

  it("2. Global Flip visible in Macro", () => {
    const zones = mapKeyZonesFromMacro(richMacro, spot);
    expect(zones[0]?.label).toBe(KEY_ZONE_LABEL_GLOBAL_FLIP);
    expect(zones[0]?.price).toContain("83,500");
  });

  it("3. Local Flip hidden in Macro", () => {
    const zones = mapKeyZonesFromMacro(richMacro, spot);
    expect(zones.some((z) => z.label === KEY_ZONE_LABEL_LOCAL_FLIP)).toBe(false);
  });

  it("4. Global Flip hidden in Micro", () => {
    const zones = mapKeyZonesFromMicro(richMicro, spot);
    expect(zones.some((z) => z.label === KEY_ZONE_LABEL_GLOBAL_FLIP)).toBe(false);
  });

  it("5. not_applicable hides the Flip", () => {
    const microHidden = {
      ...richMicro,
      localGammaFlip: { value: null, status: "not_applicable" as const },
    };
    const macroHidden = {
      ...richMacro,
      globalGammaFlip: { value: null, status: "not_applicable" as const },
    };

    expect(mapKeyZonesFromMicro(microHidden, spot).some((z) => z.label === KEY_ZONE_LABEL_LOCAL_FLIP)).toBe(
      false,
    );
    expect(mapKeyZonesFromMacro(macroHidden, spot).some((z) => z.label === KEY_ZONE_LABEL_GLOBAL_FLIP)).toBe(
      false,
    );
  });

  it("6. unavailable does not show 0", () => {
    const microUnavailable = {
      ...richMicro,
      localGammaFlip: { value: 0, status: "unavailable" as const },
    };
    const flip = mapKeyZonesFromMicro(microUnavailable, spot).find(
      (z) => z.label === KEY_ZONE_LABEL_LOCAL_FLIP,
    );
    expect(flip?.price).toBe("No disponible");
    expect(flip?.price).not.toBe("$0");
    expect(flip?.price).not.toBe("0");
  });

  it("7. selector change reuses mode=both snapshot without new request mode", () => {
    expect(MOBILE_STATE_V2_DEFAULT_MODE).toBe("both");

    const microZones = selectKeyZonesForScope({
      mode: "Micro",
      micro: richMicro,
      macro: richMacro,
      spot,
    });
    const macroZones = selectKeyZonesForScope({
      mode: "Macro",
      micro: richMicro,
      macro: richMacro,
      spot,
    });

    expect(microZones[0]?.label).toBe(flipLabelForMode("Micro"));
    expect(macroZones[0]?.label).toBe(flipLabelForMode("Macro"));
    expect(microZones[0]?.label).not.toBe(macroZones[0]?.label);
  });

  it("8. polling without content changes keeps stable zones reference", () => {
    const first = selectKeyZonesForScope({
      mode: "Macro",
      micro: richMicro,
      macro: richMacro,
      spot,
    });
    const second = selectKeyZonesForScope({
      mode: "Macro",
      micro: { ...richMicro },
      macro: { ...richMacro },
      spot,
    });

    const stable = stabilizeKeyZones({ signature: "", zones: [] }, first);
    const again = stabilizeKeyZones(stable, second);
    expect(areKeyZonesEqual(first, second)).toBe(true);
    expect(again).toBe(stable);
    expect(again.zones).toBe(stable.zones);
  });

  it("9. KeyZonesCard memo equality holds when flip value unchanged across polls", () => {
    const pollA = selectKeyZonesForScope({ mode: "Micro", micro: richMicro, macro: richMacro, spot });
    const pollB = selectKeyZonesForScope({
      mode: "Micro",
      micro: { ...richMicro },
      macro: richMacro,
      spot,
    });
    expect(areKeyZonesEqual(pollA, pollB)).toBe(true);
  });

  it("10. zone order is correct for Micro and Macro", () => {
    const microZones = mapKeyZonesFromMicro(richMicro, spot).map((z) => z.label);
    expect(microZones).toEqual([
      KEY_ZONE_LABEL_LOCAL_FLIP,
      KEY_ZONE_GROUP_NEARBY_MAGNET,
      KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    ]);

    const macroZones = mapKeyZonesFromMacro(richMacro, spot).map((z) => z.label);
    expect(macroZones).toEqual([
      KEY_ZONE_LABEL_GLOBAL_FLIP,
      "CALL WALL",
      "PUT WALL",
      "DEALER PIVOT",
      KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
      KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    ]);
  });

  it("never renders Gamma Flip label in zone list", () => {
    const microZones = mapKeyZonesFromMicro(richMicro, spot);
    const macroZones = mapKeyZonesFromMacro(richMacro, spot);
    const labels = [...microZones, ...macroZones].map((z) => z.label).join(" ");
    expect(labels.toLowerCase()).not.toContain("gamma flip");
  });

  it("available zero flip value renders as $0", () => {
    const microZero = {
      ...richMicro,
      localGammaFlip: { value: 0, status: "available" as const },
    };
    const flip = mapKeyZonesFromMicro(microZero, spot).find(
      (z) => z.label === KEY_ZONE_LABEL_LOCAL_FLIP,
    );
    expect(flip?.price).toBe("$0");
  });

  it("stale flip keeps value with degraded flag", () => {
    const microStale = {
      ...richMicro,
      localGammaFlip: { value: 84_500, status: "stale" as const },
    };
    const flip = mapKeyZonesFromMicro(microStale, spot).find(
      (z) => z.label === KEY_ZONE_LABEL_LOCAL_FLIP,
    );
    expect(flip?.price).toContain("84,500");
    expect(flip?.stale).toBe(true);
  });

  it("calculation_error shows degraded state without substituting zero", () => {
    const macroError = {
      ...richMacro,
      globalGammaFlip: { value: null, status: "calculation_error" as const },
    };
    const flip = mapKeyZonesFromMacro(macroError, spot).find(
      (z) => z.label === KEY_ZONE_LABEL_GLOBAL_FLIP,
    );
    expect(flip?.price).toBe("Error de cálculo");
    expect(flip?.stale).toBe(true);
    expect(flip?.price).not.toBe("$0");
  });
});
