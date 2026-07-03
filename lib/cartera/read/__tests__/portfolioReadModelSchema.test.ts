import { describe, expect, it } from "vitest";

import {
  migratePortfolioReadModel,
  parsePortfolioReadModel,
  PORTFOLIO_READ_MODEL_SCHEMA_VERSION,
  stampPortfolioReadModel,
} from "@/lib/cartera/read/portfolioReadModelSchema";

describe("portfolioReadModelSchema", () => {
  it("stamps schemaVersion on read models", () => {
    const model = stampPortfolioReadModel({
      totalValueUSD: 1000,
      slices: [],
      performance: [],
    });

    expect(model.schemaVersion).toBe(PORTFOLIO_READ_MODEL_SCHEMA_VERSION);
  });

  it("migrates legacy models without schemaVersion", () => {
    const migrated = migratePortfolioReadModel(
      {
        totalValueUSD: 500,
        slices: [{ symbol: "BTC", name: "Bitcoin", quantity: 1, valueUSD: 500, percent: 100 }],
        performance: [{ window: "7D", percent: 1.2 }],
      },
      1,
      1,
    );

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.totalValueUSD).toBe(500);
  });

  it("parses versioned models at runtime", () => {
    const parsed = parsePortfolioReadModel({
      schemaVersion: 1,
      totalValueUSD: 100,
      slices: [],
      performance: [],
    });

    expect(parsed.schemaVersion).toBe(1);
  });
});
