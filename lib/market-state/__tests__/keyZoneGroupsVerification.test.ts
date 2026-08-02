import { describe, expect, it } from "vitest";

import { findDuplicateZoneKeys } from "@/lib/market-state/keyZoneSelectors";
import {
  isKeyZoneExpandable,
  keyZoneMoreLabel,
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
  KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
} from "@/lib/market-state/v2UiMappers";
import { createBothModeEnvelopeFixture } from "./fixtures";

describe("key zone groups verification", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;

  it("summary labels: hidden, 1 nivel, 2 niveles, 5 niveles", () => {
    const baseMacro = {
      ...snapshot.data.macro,
      structuralMagnets: [],
      shortGammaPockets: [],
      structuralScenarios: [],
      tailScenarios: [],
    };

    const empty = mapKeyZonesFromMacro(baseMacro, spot);
    expect(empty.some((zone) => zone.id === "structural-magnets")).toBe(false);
    expect(empty.some((zone) => zone.id === "short-gamma-pockets")).toBe(false);

    const oneMagnet = mapKeyZonesFromMacro(
      {
        ...baseMacro,
        structuralMagnets: [{ price: 64_800, label: "SM1", status: "available" as const }],
      },
      spot,
    );
    const single = oneMagnet.find((zone) => zone.id === "structural-magnets");
    expect(single?.moreCount).toBe(0);
    expect(keyZoneMoreLabel(single!)).toBe("1 nivel disponible");
    expect(isKeyZoneExpandable(single!)).toBe(true);

    const twoMagnets = mapKeyZonesFromMacro(
      {
        ...baseMacro,
        structuralMagnets: [
          { price: 64_800, label: "SM1", status: "available" as const },
          { price: 65_500, label: "SM2", status: "available" as const },
        ],
      },
      spot,
    );
    const pair = twoMagnets.find((zone) => zone.id === "structural-magnets");
    expect(pair?.moreCount).toBe(1);
    expect(keyZoneMoreLabel(pair!)).toBe("2 niveles disponibles");

    const fivePockets = mapKeyZonesFromMacro(
      {
        ...baseMacro,
        shortGammaPockets: Array.from({ length: 5 }, (_, index) => ({
          price: 60_000 + index * 100,
          label: `P${index + 1}`,
          status: "available" as const,
        })),
      },
      spot,
    );
    const pocketGroup = fivePockets.find((zone) => zone.id === "short-gamma-pockets");
    expect(pocketGroup?.items?.length).toBe(5);
    expect(pocketGroup?.moreCount).toBe(4);
    expect(keyZoneMoreLabel(pocketGroup!)).toBe("5 niveles disponibles");
  });

  it("selects magnet closest to spot as primary", () => {
    const macro = {
      ...snapshot.data.macro,
      structuralMagnets: [
        { price: 64_800, label: "SM1", status: "available" as const },
        { price: 65_500, label: "SM2", status: "available" as const },
        { price: 66_200, label: "SM3", status: "available" as const },
      ],
      shortGammaPockets: [],
    };

    const zones = mapKeyZonesFromMacro(macro, spot);
    const magnetZone = zones.find((zone) => zone.id === "structural-magnets");

    expect(magnetZone?.price).toBe("$66,200");
    expect(magnetZone?.items?.[0]?.price).toBe("$66,200");
    expect(magnetZone?.items?.map((item) => item.price)).toEqual([
      "$66,200",
      "$65,500",
      "$64,800",
    ]);
  });

  it("sorts pockets by spot proximity", () => {
    const macro = {
      ...snapshot.data.macro,
      structuralMagnets: [],
      shortGammaPockets: [
        {
          price: 84_000,
          label: "near-pocket",
          status: "available" as const,
        },
        {
          price: 90_000,
          label: "active-pocket",
          active: true,
          status: "available" as const,
        },
      ],
    };

    const zones = mapKeyZonesFromMacro(macro, spot);
    const pocketZone = zones.find((zone) => zone.id === "short-gamma-pockets");

    expect(pocketZone?.price).toBe("$84,000");
    expect(pocketZone?.items?.[0]?.label).toBe("Lower Pocket #1");
    expect(pocketZone?.items?.[1]?.label).toBe("Upper Pocket #2");
  });

  it("does not render structural scenarios in key zones", () => {
    const macro = {
      ...snapshot.data.macro,
      structuralMagnets: [],
      shortGammaPockets: [],
      structuralScenarios: [
        {
          code: "HIGH",
          title: "High prob",
          thesis: "Major",
          probability: 0.8,
          status: "available" as const,
        },
      ],
      tailScenarios: [
        {
          code: "TAIL",
          title: "Tail risk",
          thesis: "Vol",
          probability: 0.1,
          status: "available" as const,
        },
      ],
    };

    const zones = mapKeyZonesFromMacro(macro, spot);
    const labels = zones.map((zone) => zone.label);

    expect(zones.find((zone) => zone.id === "structural-scenarios")).toBeUndefined();
    expect(zones.find((zone) => zone.id === "tail-scenarios")).toBeUndefined();
    expect(zones.find((zone) => zone.id === "dominant-expiry")).toBeUndefined();
    expect(labels).not.toContain("Structural Scenario");
    expect(labels).not.toContain("Tail Scenario");
  });

  it("preserves full grouped item sets for bottom sheet", () => {
    const macro = {
      ...snapshot.data.macro,
      structuralMagnets: [
        { price: 64_800, label: "SM1", status: "available" as const },
        { price: 65_500, label: "SM2", status: "available" as const },
        { price: 66_200, label: "SM3", status: "available" as const },
      ],
      shortGammaPockets: [
        {
          price: null,
          priceLow: 64_300,
          priceHigh: 65_100,
          label: "pocket-upper",
          status: "available" as const,
        },
        {
          price: null,
          priceLow: 59_500,
          priceHigh: 60_500,
          label: "pocket-lower",
          status: "available" as const,
        },
      ],
    };

    const zones = mapKeyZonesFromMacro(macro, spot);
    const magnetZone = zones.find((zone) => zone.id === "structural-magnets");
    const pocketZone = zones.find((zone) => zone.id === "short-gamma-pockets");

    expect(magnetZone?.items?.length).toBe(macro.structuralMagnets.length);
    expect(pocketZone?.items?.length).toBe(macro.shortGammaPockets.length);
    expect(magnetZone?.items?.every((item) => item.id && item.label && item.price)).toBe(true);
    expect(pocketZone?.items?.every((item) => item.id && item.label && item.price)).toBe(true);
  });

  it("uses only semantic zone ids and has no duplicate react keys", () => {
    const macroZones = mapKeyZonesFromMacro(snapshot.data.macro, spot);
    const microZones = mapKeyZonesFromMicro(snapshot.data.micro, spot);

    for (const zone of [...macroZones, ...microZones]) {
      expect(zone.id).toMatch(/^[a-z0-9-]+$/);
      expect(zone.id).not.toEqual(zone.label);
    }

    expect(findDuplicateZoneKeys(macroZones)).toEqual([]);
    expect(findDuplicateZoneKeys(microZones)).toEqual([]);
  });

  it("keeps stable macro and micro order between renders", () => {
    const macroA = mapKeyZonesFromMacro(snapshot.data.macro, spot).map((zone) => zone.id);
    const macroB = mapKeyZonesFromMacro({ ...snapshot.data.macro }, spot).map((zone) => zone.id);
    const microA = mapKeyZonesFromMicro(snapshot.data.micro, spot).map((zone) => zone.id);
    const microB = mapKeyZonesFromMicro({ ...snapshot.data.micro }, spot).map((zone) => zone.id);

    expect(macroA).toEqual(macroB);
    expect(microA).toEqual(microB);
    expect(macroA[0]).toBe("global-flip");
    expect(microA[0]).toBe("local-flip");
  });
});
