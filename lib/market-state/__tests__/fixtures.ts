import type { MobileMarketStateV2Snapshot } from "@/lib/market-state/parseV2Snapshot";
import type { MobileMarketStateV2Data } from "@/lib/market-state/v2DataSchema";

export function createBothModeEnvelopeFixture(
  overrides: {
    meta?: Partial<MobileMarketStateV2Snapshot["meta"]>;
    data?: Partial<MobileMarketStateV2Data>;
  } = {},
): MobileMarketStateV2Snapshot {
  const data: MobileMarketStateV2Data = {
    asset: {
      symbol: "BTC",
      spot: { value: 85_180.4, status: "available" },
      ...(overrides.data?.asset ?? {}),
    },
    micro: {
      localGammaFlip: { value: 84_500, status: "available" },
      distanceToLocalFlip: {
        signedDistanceUsd: 680.4,
        distanceUsd: 680.4,
        signedDistancePct: 0.8,
        distancePct: 0.8,
        position: "above_spot",
        status: "available",
      },
      localRegime: { value: "SHORT GAMMA", status: "available" },
      localTransitionZone: { value: "84k-85k", status: "available" },
      nearbyMagnets: [],
      nearbyPockets: [],
      intradayRisk: { value: "HIGH", status: "available" },
      intradayBias: { value: "BEARISH", status: "available" },
      baseIntradayScenario: {
        code: "INTRADAY_BASE",
        title: "Pullback",
        thesis: "Mean reversion to local flip",
        status: "available",
      },
      totalGex: { value: null, status: "not_applicable" },
      ...(overrides.data?.micro ?? {}),
    },
    macro: {
      globalGammaFlip: { value: 83_500, status: "available" },
      totalGex: { value: -1_200_000_000, status: "available" },
      globalRegime: { value: "SHORT GAMMA", status: "available" },
      callWall: { value: 88_000, status: "available" },
      putWall: { value: 80_000, status: "available" },
      dealerPivot: { value: 84_200, status: "available" },
      dominantExpiry: {
        date: "2026-06-20",
        instrumentCode: "BTC-20JUN26",
        daysToExpiry: 1,
        status: "available",
      },
      structuralMagnets: [],
      shortGammaPockets: [],
      structuralScenarios: [],
      tailScenarios: [],
      ...(overrides.data?.macro ?? {}),
    },
    relationship: overrides.data?.relationship ?? {
      regimeAlignment: { value: "DIVERGENT", status: "available" },
      flipOrdering: { value: "LOCAL_ABOVE_GLOBAL", status: "available" },
      conflictLevel: { value: "MEDIUM", status: "available" },
      biasAlignment: { value: "MIXED", status: "available" },
      tradeImplication: { value: "WAIT", status: "available" },
      descriptionCode: { value: "REGIME_DIVERGENT", status: "available" },
    },
    alerts: overrides.data?.alerts ?? [],
    metadata: overrides.data?.metadata ?? { accessModel: "terminal_subscription_inherited" },
  };

  return {
    schemaVersion: "2.0.0",
    validationWarnings: [],
    meta: {
      requestId: "req-1",
      snapshotId: "snap-1",
      generatedAt: "2026-06-19T12:00:00.000Z",
      servedAt: "2026-06-19T12:00:01.000Z",
      ...(overrides.meta ?? {}),
    },
    data,
  };
}

/** Raw HTTP envelope for parser tests. */
export function createBothModeRawEnvelopeFixture(
  overrides: Parameters<typeof createBothModeEnvelopeFixture>[0] = {},
) {
  const snapshot = createBothModeEnvelopeFixture(overrides);
  return {
    status: "success" as const,
    meta: snapshot.meta,
    data: snapshot.data,
  };
}

/** @deprecated Use createBothModeEnvelopeFixture */
export const createBothModeFixture = createBothModeEnvelopeFixture;
