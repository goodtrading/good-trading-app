import { describe, expect, it } from "vitest";

import {
  isKeyZoneExpandable,
  keyZoneMoreLabel,
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
  KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
} from "@/lib/market-state/v2UiMappers";
import { createBothModeEnvelopeFixture } from "./fixtures";

describe("key zone groups", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;

  it("groups multiple structural magnets into one expandable row", () => {
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
    const magnetZone = zones.find((zone) => zone.label === KEY_ZONE_GROUP_STRUCTURAL_MAGNET);

    expect(magnetZone?.price).toBe("$66,200");
    expect(magnetZone?.moreCount).toBe(2);
    expect(keyZoneMoreLabel(magnetZone!)).toBe("+2 más");
    expect(isKeyZoneExpandable(magnetZone!)).toBe(true);
    expect(magnetZone?.modalTitle).toBe("STRUCTURAL MAGNETS");
    expect(magnetZone?.items).toEqual([
      { id: "structural-magnets-magnet-0", label: "#1", price: "$66,200", distance: expect.any(String), stale: false },
      { id: "structural-magnets-magnet-1", label: "#2", price: "$65,500", distance: expect.any(String), stale: false },
      { id: "structural-magnets-magnet-2", label: "#3", price: "$64,800", distance: expect.any(String), stale: false },
    ]);
  });

  it("groups multiple pockets with range prices and named modal rows", () => {
    const macro = {
      ...snapshot.data.macro,
      structuralMagnets: [],
      shortGammaPockets: [
        {
          price: null,
          priceLow: 64_300,
          priceHigh: 65_100,
          label: "pocket-upper-69500-70500",
          status: "available" as const,
        },
        {
          price: null,
          priceLow: 66_500,
          priceHigh: 67_500,
          label: "pocket-upper-2",
          status: "available" as const,
        },
        {
          price: null,
          priceLow: 59_500,
          priceHigh: 60_500,
          label: "pocket-lower-1",
          status: "available" as const,
        },
        {
          price: null,
          priceLow: 58_000,
          priceHigh: 59_000,
          label: "pocket-lower-2",
          status: "available" as const,
        },
        {
          price: null,
          priceLow: 57_000,
          priceHigh: 58_000,
          label: "pocket-lower-3",
          status: "available" as const,
        },
      ],
    };

    const zones = mapKeyZonesFromMacro(macro, spot);
    const pocketZone = zones.find((zone) => zone.label === KEY_ZONE_GROUP_SHORT_GAMMA_POCKET);

    expect(pocketZone?.price).toBe("66,500 - 67,500");
    expect(pocketZone?.moreCount).toBe(4);
    expect(keyZoneMoreLabel(pocketZone!)).toBe("+4 más");
    expect(pocketZone?.items?.[0]).toEqual({
      id: "short-gamma-pockets-pocket-0",
      label: "Upper Pocket",
      price: "66,500 - 67,500",
      distance: expect.any(String),
      stale: false,
    });
    expect(pocketZone?.items?.[2]?.label).toBe("Lower Pocket");
  });

  it("keeps flip and wall rows as single non-expandable entries", () => {
    const zones = mapKeyZonesFromMacro(snapshot.data.macro, spot);
    const flip = zones.find((zone) => zone.id === "global-flip");
    const callWall = zones.find((zone) => zone.id === "call-wall");

    expect(isKeyZoneExpandable(flip!)).toBe(false);
    expect(isKeyZoneExpandable(callWall!)).toBe(false);
    expect(keyZoneMoreLabel(flip!)).toBeNull();
  });

  it("does not mark single-item groups as expandable", () => {
    const micro = {
      ...snapshot.data.micro,
      nearbyMagnets: [{ price: 86_000, label: "M1", status: "available" as const }],
      nearbyPockets: [],
    };

    const zones = mapKeyZonesFromMicro(micro, spot);
    const magnetZone = zones.find((zone) => zone.id === "nearby-magnets");

    expect(magnetZone?.moreCount).toBe(0);
    expect(isKeyZoneExpandable(magnetZone!)).toBe(false);
  });
});
