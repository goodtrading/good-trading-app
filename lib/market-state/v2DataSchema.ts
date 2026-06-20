import { z } from "zod";

import type { DataStatus, DistanceMetrics, DominantExpiryBlock } from "@/shared/mobileMarketStateV2.contract";
import {
  isTerminalMarketStatePayload,
  mapTerminalPayloadToMobileV2,
} from "./mapTerminalPayloadToMobileV2";
import { formatZodPath, logV2Validation } from "./v2SnapshotPipelineLog";

export type { DataStatus, DistanceMetrics, DominantExpiryBlock };

export const dataStatusSchema = z.enum([
  "available",
  "unavailable",
  "stale",
  "not_applicable",
  "calculation_error",
]);

export const spotPositionSchema = z.enum(["above_spot", "below_spot", "at_spot"]);

export const marketScopeModeSchema = z.enum(["micro", "macro"]);

export type MarketScopeMode = z.infer<typeof marketScopeModeSchema>;

export const valuedFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    status: dataStatusSchema,
  });

export const distanceMetricsSchema = z.object({
  signedDistanceUsd: z.number().nullable(),
  distanceUsd: z.number().nullable(),
  signedDistancePct: z.number().nullable(),
  distancePct: z.number().nullable(),
  position: spotPositionSchema.nullable(),
  status: dataStatusSchema,
}) satisfies z.ZodType<DistanceMetrics>;

export const dominantExpiryBlockSchema = z.object({
  date: z.string().nullable(),
  instrumentCode: z.string().nullable(),
  daysToExpiry: z.number().nullable(),
  status: dataStatusSchema,
}) satisfies z.ZodType<DominantExpiryBlock>;

export const magnetSchema = z.object({
  price: z.number().nullable(),
  label: z.string().nullable(),
  status: dataStatusSchema,
});

export const pocketSchema = z.object({
  price: z.number().nullable(),
  priceLow: z.number().nullable().optional(),
  priceHigh: z.number().nullable().optional(),
  label: z.string().nullable(),
  active: z.boolean().nullish(),
  isActive: z.boolean().nullish(),
  status: dataStatusSchema,
});

export const scenarioSchema = z.object({
  code: z.string().nullable(),
  title: z.string().nullable(),
  thesis: z.string().nullable(),
  probability: z.number().nullable().nullish(),
  status: dataStatusSchema,
});

export const microContextSchema = z.object({
  localGammaFlip: valuedFieldSchema(z.number()),
  distanceToLocalFlip: distanceMetricsSchema,
  localRegime: valuedFieldSchema(z.string()),
  localTransitionZone: valuedFieldSchema(z.string()),
  nearbyMagnets: z.array(magnetSchema),
  nearbyPockets: z.array(pocketSchema),
  intradayRisk: valuedFieldSchema(z.string()),
  intradayBias: valuedFieldSchema(z.string()),
  baseIntradayScenario: scenarioSchema,
  totalGex: valuedFieldSchema(z.number()),
});

export type MicroContext = z.infer<typeof microContextSchema>;

export const macroContextSchema = z.object({
  globalGammaFlip: valuedFieldSchema(z.number()),
  totalGex: valuedFieldSchema(z.number()),
  globalRegime: valuedFieldSchema(z.string()),
  callWall: valuedFieldSchema(z.number()),
  putWall: valuedFieldSchema(z.number()),
  dealerPivot: valuedFieldSchema(z.number()),
  dominantExpiry: dominantExpiryBlockSchema,
  structuralMagnets: z.array(magnetSchema),
  shortGammaPockets: z.array(pocketSchema),
  structuralScenarios: z.array(scenarioSchema),
  tailScenarios: z.array(scenarioSchema),
});

export type MacroContext = z.infer<typeof macroContextSchema>;

export const relationshipDescriptionCodeSchema = z.enum([
  "REGIME_ALIGNED",
  "REGIME_DIVERGENT",
  "LOCAL_ABOVE_GLOBAL",
  "LOCAL_BELOW_GLOBAL",
  "CONTEXT_CONFLICT_WAIT",
  "TREND_CONTINUATION_LIKELY",
]);

export type RelationshipDescriptionCode = z.infer<typeof relationshipDescriptionCodeSchema>;

export const relationshipSchema = z.object({
  regimeAlignment: valuedFieldSchema(z.string()),
  flipOrdering: valuedFieldSchema(z.string()),
  conflictLevel: valuedFieldSchema(z.string()),
  biasAlignment: valuedFieldSchema(z.string()),
  tradeImplication: valuedFieldSchema(z.string()),
  descriptionCode: valuedFieldSchema(relationshipDescriptionCodeSchema),
});

export type Relationship = z.infer<typeof relationshipSchema>;

export const alertItemSchema = z.object({
  id: z.string(),
  message: z.string().nullable(),
  severity: z.string().nullable(),
  status: dataStatusSchema,
  createdAt: z.string().nullable(),
});

export const assetSpotSchema = z.object({
  value: z.number().nullable(),
  status: dataStatusSchema,
});

export const mobileMarketStateV2DataSchema = z.object({
  asset: z.object({
    symbol: z.string(),
    spot: assetSpotSchema,
  }),
  micro: microContextSchema,
  macro: macroContextSchema,
  relationship: relationshipSchema.nullable(),
  alerts: z.array(alertItemSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type MobileMarketStateV2Data = z.infer<typeof mobileMarketStateV2DataSchema>;

export const criticalMobileMarketStateV2DataSchema = z.object({
  asset: z.object({
    symbol: z.string(),
    spot: assetSpotSchema,
  }),
  micro: microContextSchema,
  macro: macroContextSchema,
});

export type ParseMobileMarketStateV2DataResult = {
  data: MobileMarketStateV2Data;
  warnings: string[];
};

export class V2DataValidationError extends Error {
  readonly name = "V2DataValidationError";
  readonly code = "VALIDATION_ERROR" as const;
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    super("Mobile market-state v2 data validation failed");
    this.issues = issues;
  }
}

export function parseMobileMarketStateV2Data(payload: unknown): MobileMarketStateV2Data {
  return parseMobileMarketStateV2DataWithWarnings(payload).data;
}

export function parseMobileMarketStateV2DataWithWarnings(
  payload: unknown,
  fetchId: number | null = null,
): ParseMobileMarketStateV2DataResult {
  const normalizedPayload = isTerminalMarketStatePayload(payload)
    ? mapTerminalPayloadToMobileV2(payload)
    : payload;

  const critical = criticalMobileMarketStateV2DataSchema.safeParse(normalizedPayload);
  if (!critical.success) {
    const first = critical.error.issues[0];
    logV2Validation({
      fetchId,
      success: false,
      path: first ? formatZodPath(first.path) : null,
      message: first?.message ?? "Critical schema validation failed",
      issueCount: critical.error.issues.length,
    });
    throw new V2DataValidationError(critical.error.issues);
  }

  const full = mobileMarketStateV2DataSchema.safeParse(normalizedPayload);
  if (full.success) {
    logV2Validation({ fetchId, success: true, path: null, message: null });
    return { data: full.data, warnings: [] };
  }

  const warnings = full.error.issues.map((issue) => issue.path.join(".") || issue.message);
  const partial = normalizedPayload as Record<string, unknown>;

  return {
    data: {
      ...critical.data,
      relationship:
        relationshipSchema.nullable().safeParse(partial.relationship).success
          ? (relationshipSchema.nullable().parse(partial.relationship) as Relationship | null)
          : null,
      alerts: z.array(alertItemSchema).safeParse(partial.alerts).success
        ? z.array(alertItemSchema).parse(partial.alerts)
        : [],
      metadata: z.record(z.unknown()).optional().safeParse(partial.metadata).success
        ? z.record(z.unknown()).optional().parse(partial.metadata)
        : undefined,
    },
    warnings,
  };
}
