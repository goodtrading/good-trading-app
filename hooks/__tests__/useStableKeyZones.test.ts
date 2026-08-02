import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "@/lib/market-state/__tests__/fixtures";
import { stabilizeKeyZones } from "@/lib/market-state/keyZoneSelectors";
import { selectKeyZonesForScope } from "@/lib/market-state/keyZoneSelectors";

const legacyFallback = [
  { label: "Call Wall", price: "$1", type: "resistance" as const, distance: "—" },
  { label: "Put Wall", price: "$2", type: "support" as const, distance: "—" },
];

describe("useStableKeyZones contract", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;

  it("v2 mapping replaces legacy-only zone sets", () => {
    const mapped = selectKeyZonesForScope({
      mode: "Macro",
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      spot,
    });
    const fresh = stabilizeKeyZones({ signature: JSON.stringify(legacyFallback), zones: legacyFallback }, mapped);
    expect(fresh.zones[0]?.label).toBe("Global Flip");
    expect(fresh.zones.length).toBeGreaterThan(2);
    expect(fresh.zones).not.toEqual(legacyFallback);
  });
});
