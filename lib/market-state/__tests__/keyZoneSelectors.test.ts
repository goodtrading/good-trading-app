import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "./fixtures";
import {
  areKeyZonesEqual,
  keyZonesSignature,
  selectKeyZonesForScope,
  stabilizeKeyZones,
} from "@/lib/market-state/keyZoneSelectors";

describe("keyZoneSelectors", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;

  it("keeps stable reference when mapped zone content is unchanged", () => {
    const first = selectKeyZonesForScope({
      mode: "Macro",
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      spot,
    });
    const second = selectKeyZonesForScope({
      mode: "Macro",
      micro: { ...snapshot.data.micro },
      macro: { ...snapshot.data.macro },
      spot,
    });

    expect(areKeyZonesEqual(first, second)).toBe(true);
    expect(keyZonesSignature(first)).toBe(keyZonesSignature(second));

    const stable = stabilizeKeyZones({ signature: "", zones: [] }, first);
    const again = stabilizeKeyZones(stable, second);
    expect(again).toBe(stable);
    expect(again.zones).toBe(stable.zones);
  });

  it("returns new reference when selected mode changes", () => {
    const macroZones = selectKeyZonesForScope({
      mode: "Macro",
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      spot,
    });
    const microZones = selectKeyZonesForScope({
      mode: "Micro",
      micro: snapshot.data.micro,
      macro: snapshot.data.macro,
      spot,
    });

    expect(areKeyZonesEqual(macroZones, microZones)).toBe(false);
  });
});
