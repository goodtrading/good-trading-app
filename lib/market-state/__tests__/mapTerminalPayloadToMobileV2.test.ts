import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  criticalMobileMarketStateV2DataSchema,
  parseMobileMarketStateV2DataWithWarnings,
} from "@/lib/market-state/v2DataSchema";
import {
  isTerminalMarketStatePayload,
  mapTerminalPayloadToMobileV2,
} from "@/lib/market-state/mapTerminalPayloadToMobileV2";
import { parseMobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";
import {
  KEY_ZONE_GROUP_NEARBY_MAGNET,
  KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
  KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
  KEY_ZONE_LABEL_GLOBAL_FLIP,
  KEY_ZONE_LABEL_LOCAL_FLIP,
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
} from "@/lib/market-state/v2UiMappers";

const productionFixture = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mobileMarketStateV2.production.terminal.json"),
    "utf8",
  ),
);

const sanitizedEnvelope = JSON.parse(
  readFileSync(
    path.join(__dirname, "fixtures/mobileMarketStateV2.real.sanitized.json"),
    "utf8",
  ),
);

describe("mapTerminalPayloadToMobileV2", () => {
  it("detects terminal payload shape", () => {
    expect(isTerminalMarketStatePayload(productionFixture)).toBe(true);
    expect(isTerminalMarketStatePayload(sanitizedEnvelope.data)).toBe(false);
  });

  it("maps production terminal payload to mobile flat contract", () => {
    const mapped = mapTerminalPayloadToMobileV2(productionFixture) as Record<string, unknown>;
    const micro = mapped.micro as Record<string, unknown>;
    const macro = mapped.macro as Record<string, unknown>;

    expect(micro.localGammaFlip).toEqual({
      value: 63334.548424768305,
      status: "available",
    });
    expect(micro.localRegime).toEqual({
      value: "LONG GAMMA",
      status: "available",
    });
    expect(macro.globalGammaFlip).toEqual({
      value: 65565.17257890424,
      status: "available",
    });
    expect(macro.callWall).toEqual({ value: 70000, status: "available" });
    expect(macro.putWall).toEqual({ value: 60000, status: "available" });
    expect(macro.dealerPivot).toEqual({ value: 65000, status: "available" });
    expect(Array.isArray(micro.nearbyMagnets)).toBe(true);
    expect(Array.isArray(macro.shortGammaPockets)).toBe(true);
  });

  it("passes critical schema with zero validation issues", () => {
    const mapped = mapTerminalPayloadToMobileV2(productionFixture);
    const parsed = criticalMobileMarketStateV2DataSchema.safeParse(mapped);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error(JSON.stringify(parsed.error.issues, null, 2));
    }
  });

  it("parses through parseMobileMarketStateV2DataWithWarnings without throwing", () => {
    expect(() => parseMobileMarketStateV2DataWithWarnings(productionFixture)).not.toThrow();
  });

  it("parses full production envelope snapshot", () => {
    const envelope = {
      status: "success",
      data: productionFixture,
      meta: {
        requestId: "req-production-001",
        snapshotId: "snap-production-001",
        generatedAt: "2026-06-19T12:00:00.000Z",
        servedAt: "2026-06-19T12:00:01.000Z",
      },
    };

    const snapshot = parseMobileMarketStateV2Snapshot(envelope);
    expect(snapshot.data.micro.localGammaFlip.value).toBe(63334.548424768305);
    expect(snapshot.data.macro.globalGammaFlip.value).toBe(65565.17257890424);
    expect(snapshot.data.macro.callWall.value).toBe(70000);
  });

  it("delivers grouped micro and macro rows after mapping", () => {
    const { data } = parseMobileMarketStateV2DataWithWarnings(productionFixture);
    const spot = data.asset.spot.value;

    const microZones = mapKeyZonesFromMicro(data.micro, spot).map((zone) => zone.label);
    const macroZones = mapKeyZonesFromMacro(data.macro, spot).map((zone) => zone.label);

    expect(microZones).toEqual([
      KEY_ZONE_LABEL_LOCAL_FLIP,
      KEY_ZONE_GROUP_NEARBY_MAGNET,
      KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    ]);
    expect(macroZones).toEqual([
      KEY_ZONE_LABEL_GLOBAL_FLIP,
      "CALL WALL",
      "PUT WALL",
      "DEALER PIVOT",
      KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
      KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    ]);
    expect(microZones.length).toBe(3);
    expect(macroZones.length).toBe(6);
  });

  it("keeps sanitized mobile payload unchanged", () => {
    const mapped = mapTerminalPayloadToMobileV2(sanitizedEnvelope.data);
    expect(mapped).toBe(sanitizedEnvelope.data);
    expect(() => parseMobileMarketStateV2DataWithWarnings(sanitizedEnvelope.data)).not.toThrow();
  });

  it("enables hook snapshot flags after terminal payload parse", () => {
    const envelope = {
      status: "success",
      data: productionFixture,
      meta: {
        requestId: "req-production-001",
        snapshotId: "snap-production-001",
        generatedAt: "2026-06-19T12:00:00.000Z",
        servedAt: "2026-06-19T12:00:01.000Z",
      },
    };

    const snapshot = parseMobileMarketStateV2Snapshot(envelope);
    const hasSnapshot = true;
    const hasData = Boolean(snapshot);
    const hasMicro = Boolean(snapshot.data.micro);
    const hasMacro = Boolean(snapshot.data.macro);

    expect(hasSnapshot).toBe(true);
    expect(hasData).toBe(true);
    expect(hasMicro).toBe(true);
    expect(hasMacro).toBe(true);
  });

  it("reports 21 critical schema errors before mapping and zero after", () => {
    const before = criticalMobileMarketStateV2DataSchema.safeParse(productionFixture);
    const after = criticalMobileMarketStateV2DataSchema.safeParse(
      mapTerminalPayloadToMobileV2(productionFixture),
    );

    expect(before.success).toBe(false);
    expect(before.success ? 0 : before.error.issues.length).toBe(21);
    expect(after.success).toBe(true);
    expect(after.success ? 0 : after.error.issues.length).toBe(0);
  });
});
