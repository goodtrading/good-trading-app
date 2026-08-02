import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createBothModeEnvelopeFixture } from "./fixtures";
import { parseMobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";
import {
  mapGammaCardFromMacro,
  mapGammaCardFromMicro,
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  mapRelationshipDescription,
} from "@/lib/market-state/v2UiMappers";

describe("v2UiMappers", () => {
  const snapshot = createBothModeEnvelopeFixture();
  const spot = snapshot.data.asset.spot.value;

  it("20. Micro uses local flip", () => {
    const view = mapGammaCardFromMicro(snapshot.data.micro, snapshot.data.relationship);
    expect(view.flipPoint).toContain("84,500");
    expect(view.state).toBe("SHORT");
  });

  it("21. Macro uses global flip", () => {
    const view = mapGammaCardFromMacro(snapshot.data.macro, snapshot.data.relationship);
    expect(view.flipPoint).toContain("83,500");
    expect(view.state).toBe("SHORT");
  });

  it("22. Total GEX hidden in Micro", () => {
    const view = mapGammaCardFromMicro(snapshot.data.micro, snapshot.data.relationship);
    expect(view.hideNetGamma).toBe(true);
    expect(view.netGamma).toBe("");
  });

  it("23. Total GEX visible in Macro", () => {
    const view = mapGammaCardFromMacro(snapshot.data.macro, snapshot.data.relationship);
    expect(view.hideNetGamma).toBe(false);
    expect(view.netGamma).toContain("B");
  });

  it("24. not_applicable hides metric", () => {
    const view = mapGammaCardFromMicro(snapshot.data.micro, snapshot.data.relationship);
    expect(view.hideNetGamma).toBe(true);
  });

  it("25. stale keeps value", () => {
    const micro = {
      ...snapshot.data.micro,
      localGammaFlip: { value: 84_500, status: "stale" as const },
    };
    const view = mapGammaCardFromMicro(micro, snapshot.data.relationship);
    expect(view.flipPoint).toContain("84,500");
    expect(view.flipPointStale).toBe(true);
  });

  it("26. unavailable does not show zero", () => {
    const micro = {
      ...snapshot.data.micro,
      localGammaFlip: { value: null, status: "unavailable" as const },
    };
    const view = mapGammaCardFromMicro(micro, snapshot.data.relationship);
    expect(view.flipPoint).not.toBe("0");
    expect(view.flipPoint).not.toBe("$0");
  });

  it("27. Micro shows local levels", () => {
    const zones = mapKeyZonesFromMicro(snapshot.data.micro, spot);
    expect(zones.some((z) => z.label === "Local Flip")).toBe(true);
  });

  it("28. Macro shows structural walls", () => {
    const zones = mapKeyZonesFromMacro(snapshot.data.macro, spot);
    expect(zones.some((z) => z.label === "Call Wall")).toBe(true);
    expect(zones.some((z) => z.label === "Put Wall")).toBe(true);
  });

  it("29. Pockets are grouped into one expandable row", () => {
    const microWithPockets = {
      ...snapshot.data.micro,
      nearbyPockets: [
        { price: 84_800, label: "P1", status: "available" as const },
        { price: 84_600, label: "P2", status: "available" as const },
      ],
    };
    const zones = mapKeyZonesFromMicro(microWithPockets, spot);
    const pocketGroup = zones.find((z) => z.id === "nearby-pockets");
    expect(pocketGroup?.label).toBe("Short Gamma Pocket");
    expect(pocketGroup?.items?.length).toBe(2);
    expect(pocketGroup?.moreCount).toBe(1);
  });

  it("30. Distances are formatted", () => {
    const zones = mapKeyZonesFromMicro(snapshot.data.micro, spot);
    const flip = zones.find((z) => z.label === "Local Flip");
    expect(flip?.distance).toMatch(/%|—/);
  });

  it("31. No local/global mix in micro zones", () => {
    const zones = mapKeyZonesFromMicro(snapshot.data.micro, spot);
    expect(zones.some((z) => z.label === "Global Flip")).toBe(false);
    expect(zones.some((z) => z.label === "Call Wall")).toBe(false);
  });

  it("relationship maps descriptionCode to readable text", () => {
    const text = mapRelationshipDescription(snapshot.data.relationship);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("REGIME_DIVERGENT");
  });
});

describe("sanitized real fixture", () => {
  const sanitizedFixture = JSON.parse(
    readFileSync(
      path.join(__dirname, "fixtures/mobileMarketStateV2.real.sanitized.json"),
      "utf8",
    ),
  );

  it("10. fixture real parsea", () => {
    const parsed = parseMobileMarketStateV2Snapshot(sanitizedFixture);
    expect(parsed.data.asset.symbol).toBe("BTC");
    expect(parsed.meta.requestId).toBeTruthy();
    expect(parsed.meta.snapshotId).toBeTruthy();
  });

  it("12. Micro parsea", () => {
    const parsed = parseMobileMarketStateV2Snapshot(sanitizedFixture);
    expect(parsed.data.micro.localRegime.value).toContain("SHORT");
  });

  it("13. Macro parsea", () => {
    const parsed = parseMobileMarketStateV2Snapshot(sanitizedFixture);
    expect(parsed.data.macro.totalGex.status).toBe("available");
  });

  it("14. Relationship parsea", () => {
    const parsed = parseMobileMarketStateV2Snapshot(sanitizedFixture);
    expect(parsed.data.relationship?.descriptionCode.value).toBe("REGIME_DIVERGENT");
  });

  it("15. Meta parsea", () => {
    const parsed = parseMobileMarketStateV2Snapshot(sanitizedFixture);
    expect(parsed.meta.generatedAt).toBeTruthy();
    expect(parsed.meta.servedAt).toBeTruthy();
  });
});
