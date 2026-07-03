import { describe, expect, it, vi } from "vitest";

import { MemoryPortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";

import { readAccountLedger } from "@/lib/cartera/read/ledgerReadRepository";
import { PortfolioReadModelService } from "@/lib/cartera/read/portfolioReadModelService";
import { buildPortfolioReadModel } from "@/lib/cartera/read/portfolioReadProjection";

vi.mock("@/lib/cartera/read/ledgerReadRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cartera/read/ledgerReadRepository")>();
  return {
    ...actual,
    readAccountLedger: vi.fn(),
  };
});

vi.mock("@/lib/portfolio/accounts/accountStorage", () => ({
  loadAccountsRegistry: vi.fn(async () => ({
    accounts: [{ id: "acc_1", name: "Paper 1", initialBalance: 10000, createdAt: 0 }],
    activeAccountId: "acc_1",
  })),
}));

vi.mock("@/lib/portfolio/exchanges/exchangeConnectionStorage", () => ({
  loadExchangeConnections: vi.fn(async () => ({
    binance: { connected: false },
    bingx: { connected: false },
  })),
}));

describe("PortfolioReadModelService", () => {
  it("builds read model from ledger projection without PortfolioEngine.getState", async () => {
    const storage = new MemoryPortfolioStorage();
    const engine = createPortfolioEngine(storage, new PaperBroker());
    await engine.buy(0.01, 80000, 85000);

    const persisted = await storage.load();
    vi.mocked(readAccountLedger).mockResolvedValueOnce(persisted);

    const model = await PortfolioReadModelService.load(85000);
    expect(model.totalValueUSD).toBeGreaterThan(0);
    expect(model.slices.length).toBeGreaterThan(0);
    expect(model.schemaVersion).toBe(1);
  });

  it("buildPortfolioReadModel is pure aggregation", () => {
    const model = buildPortfolioReadModel({
      positions: [
        {
          symbol: "BTC",
          name: "Bitcoin",
          type: "spot",
          quantity: 1,
          entryPrice: 80000,
          currentPrice: 85000,
          valueUSD: 85000,
          pnl: 5000,
          pnlPercent: 6.25,
        },
      ],
    });

    expect(model.totalValueUSD).toBe(85000);
    expect(model.slices[0]?.symbol).toBe("BTC");
    expect(model.schemaVersion).toBe(1);
  });
});
