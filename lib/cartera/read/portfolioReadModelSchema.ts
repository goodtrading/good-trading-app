import { z } from "zod";

import type { PerformanceMetric, PortfolioReadModel, WealthSlice } from "./types";

export const PORTFOLIO_READ_MODEL_SCHEMA_VERSION = 1;

const wealthSliceSchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().finite(),
    valueUSD: z.number().finite(),
    percent: z.number().finite(),
  })
  .strict();

const performanceMetricSchema = z
  .object({
    window: z.enum(["7D", "30D", "90D", "YTD"]),
    percent: z.number().finite(),
  })
  .strict();

export const portfolioReadModelV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    totalValueUSD: z.number().finite(),
    slices: z.array(wealthSliceSchema),
    performance: z.array(performanceMetricSchema),
  })
  .strict();

export type PortfolioReadModelV1 = z.infer<typeof portfolioReadModelV1Schema>;

export function parsePortfolioReadModel(input: unknown): PortfolioReadModel {
  const withVersion = z
    .object({
      schemaVersion: z.number().int().positive().optional(),
      totalValueUSD: z.number().finite(),
      slices: z.array(wealthSliceSchema),
      performance: z.array(performanceMetricSchema),
    })
    .strict()
    .safeParse(input);

  if (!withVersion.success) {
    throw new Error(
      `Invalid PortfolioReadModel: ${withVersion.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  const version = withVersion.data.schemaVersion ?? 1;
  return migratePortfolioReadModel(withVersion.data, version, PORTFOLIO_READ_MODEL_SCHEMA_VERSION);
}

export function migratePortfolioReadModel(
  input: unknown,
  fromVersion: number,
  toVersion: number = PORTFOLIO_READ_MODEL_SCHEMA_VERSION,
): PortfolioReadModel {
  if (fromVersion > toVersion) {
    throw new Error(`Cannot downgrade PortfolioReadModel from v${fromVersion} to v${toVersion}`);
  }

  const versioned = portfolioReadModelV1Schema.safeParse(input);
  if (versioned.success) {
    return versioned.data;
  }

  let current: PortfolioReadModel;

  if (fromVersion <= 0 || fromVersion === 1) {
    const legacy = z
      .object({
        totalValueUSD: z.number().finite(),
        slices: z.array(wealthSliceSchema),
        performance: z.array(performanceMetricSchema),
      })
      .strict()
      .parse(input);

    current = {
      schemaVersion: 1,
      totalValueUSD: legacy.totalValueUSD,
      slices: legacy.slices as WealthSlice[],
      performance: legacy.performance as PerformanceMetric[],
    };
  } else {
    throw new Error(`Unsupported PortfolioReadModel source version: ${fromVersion}`);
  }

  if (toVersion === 1) {
    return portfolioReadModelV1Schema.parse(current);
  }

  throw new Error(`Unsupported PortfolioReadModel target version: ${toVersion}`);
}

export function stampPortfolioReadModel(
  model: Omit<PortfolioReadModel, "schemaVersion"> & { schemaVersion?: number },
): PortfolioReadModel {
  return portfolioReadModelV1Schema.parse({
    ...model,
    schemaVersion: PORTFOLIO_READ_MODEL_SCHEMA_VERSION,
  });
}
