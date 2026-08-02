import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryStore = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => memoryStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: async (key: string) => {
      memoryStore.delete(key);
    },
    clear: async () => {
      memoryStore.clear();
    },
  },
}));

import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
import { isSettlementOnlyFinancialEvent } from "@/lib/portfolio/financial/FinancialEventLedger";
import { computeLiquidationState } from "@/lib/portfolio/futures/MarginModel";
import {
  computeLiquidationDeficit,
  computeLiquidationSurplus,
} from "@/lib/portfolio/insurance/InsuranceFundPolicy";
import {
  resolveInsuranceSettlement,
} from "@/lib/portfolio/insurance/InsuranceFundEngine";
import { createEmptyInsuranceFundState } from "@/lib/portfolio/insurance/InsuranceFund";
import { insuranceFundRuntime } from "@/lib/portfolio/insurance/InsuranceFundRuntime";
import { loadInsuranceFund } from "@/lib/portfolio/insurance/insuranceStorage";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createLiquidationEngine,
} from "@/lib/portfolio/risk/LiquidationEngine";
import { createRiskScheduler } from "@/lib/portfolio/risk/RiskScheduler";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import { WalletService } from "@/lib/portfolio/wallets/WalletService";
import type { Position, Trade } from "@/lib/portfolio/types";

const WALLET_ID = "insurance_test";
const MARK = 60_000;

function createMutablePriceFeed(initial: number | null = null) {
  let price = initial;
  return {
    getLastPrice: () => price,
    setPrice: (next: number | null) => {
      price = next;
    },
  };
}

function mockPosition(partial: Partial<Position> = {}): Position {
  return {
    symbol: "BTCUSDT",
    quantity: 1,
    avgEntry: MARK,
    marketPrice: 53_000,
    markPrice: 53_000,
    marginMode: "ISOLATED",
    leverage: 10,
    entryMargin: 6_000,
    maintenanceMargin: 265,
    liquidationPrice: 54_600,
    positionValue: 53_000,
    unrealizedPnL: -7_000,
    realizedPnL: 0,
    roiPercent: -116.67,
    marginRatio: 999,
    status: "OPEN",
    ...partial,
  };
}

function mockClosingTrade(price: number): Trade {
  return {
    id: `trade_liq_${Date.now()}`,
    symbol: "BTCUSDT",
    side: "SELL",
    quantity: 1,
    price,
    timestamp: Date.now(),
    source: "PAPER",
    fees: { totalFee: 0, openingFee: 0, closingFee: 0, breakdown: {} as never, feeCurrency: "USDT" },
    liquidation: true,
  };
}

describe("Insurance Fund (FASE 12.9)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("computes deficit when execution is below bankruptcy for LONG", () => {
    const bankruptcy = 54_000;
    const deficit = computeLiquidationDeficit({
      side: "LONG",
      quantity: 1,
      executionPrice: 53_000,
      bankruptcyPrice: bankruptcy,
    });
    expect(deficit).toBe(1_000);
  });

  it("routes surplus to fund when liquidation has no deficit", () => {
    const surplus = computeLiquidationSurplus({
      side: "LONG",
      quantity: 1,
      executionPrice: 55_000,
      entryMargin: 6_000,
      marginMode: "ISOLATED",
    });
    expect(surplus).toBeGreaterThan(0);
  });

  it("liquidation with deficit queues ADL when fund is empty", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      positionMode: "LONG_ONLY",
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine, {
      walletId: WALLET_ID,
      storage,
    });
    const priceFeed = createMutablePriceFeed(MARK);

    await engine.buy(1, MARK, MARK);
    priceFeed.setPrice(53_000);
    await createRiskScheduler(engine, liquidationEngine, priceFeed).tick();

    const fund = await loadInsuranceFund(WALLET_ID);
    expect(fund.adlExposure).toBeGreaterThan(0);
    expect(fund.balance).toBe(0);

    const persisted = await storage.load();
    expect(persisted.financialEvents?.some((e) => e.type === "ADL")).toBe(true);
    expect(persisted.financialEvents?.some((e) => e.type === "INSURANCE_PAYOUT")).toBe(false);
  });

  it("fund absorbs deficit when balance is sufficient", async () => {
    const state = createEmptyInsuranceFundState(WALLET_ID);
    state.balance = 5_000;

    const position = mockPosition();
    const liquidation = computeLiquidationState({
      quantity: position.quantity,
      avgEntry: position.avgEntry,
      entryMargin: position.entryMargin,
      markPrice: 53_000,
      leverage: position.leverage,
      marginMode: position.marginMode,
      walletBalance: 500_000,
    });

    const settlement = resolveInsuranceSettlement(state, {
      walletId: WALLET_ID,
      position,
      liquidationResult: {
        positionId: "BTCUSDT",
        side: "LONG",
        quantity: 1,
        avgEntry: MARK,
        marketPrice: 53_000,
        liquidationPrice: liquidation.liquidationPrice,
        leverage: 10,
        marginMode: "ISOLATED",
        reason: "EQUITY_BREACH",
      },
      closingTrade: mockClosingTrade(53_000),
      bankruptcyPrice: liquidation.bankruptcyPrice,
    });

    expect(settlement.payout).toBe(1_000);
    expect(settlement.adlResidual).toBe(0);
    expect(settlement.fundBalance).toBe(4_000);
    expect(settlement.financialEvents.some((e) => e.type === "INSURANCE_PAYOUT")).toBe(true);
  });

  it("liquidation surplus increases fund balance", async () => {
    const state = createEmptyInsuranceFundState(WALLET_ID);
    const position = mockPosition({ markPrice: 55_000, marketPrice: 55_000 });

    const settlement = resolveInsuranceSettlement(state, {
      walletId: WALLET_ID,
      position,
      liquidationResult: {
        positionId: "BTCUSDT",
        side: "LONG",
        quantity: 1,
        avgEntry: MARK,
        marketPrice: 55_000,
        liquidationPrice: 54_600,
        leverage: 10,
        marginMode: "ISOLATED",
        reason: "EQUITY_BREACH",
      },
      closingTrade: mockClosingTrade(55_000),
      bankruptcyPrice: 54_000,
    });

    expect(settlement.gain).toBeGreaterThan(0);
    expect(settlement.fundBalance).toBe(settlement.gain);
    expect(settlement.financialEvents.some((e) => e.type === "INSURANCE_GAIN")).toBe(true);
  });

  it("accumulates across multiple liquidations", async () => {
    let state = createEmptyInsuranceFundState(WALLET_ID);

    const gainSettlement = resolveInsuranceSettlement(state, {
      walletId: WALLET_ID,
      position: mockPosition({ markPrice: 55_000 }),
      liquidationResult: {
        positionId: "BTCUSDT",
        side: "LONG",
        quantity: 1,
        avgEntry: MARK,
        marketPrice: 55_000,
        liquidationPrice: 54_600,
        leverage: 10,
        marginMode: "ISOLATED",
        reason: "EQUITY_BREACH",
      },
      closingTrade: mockClosingTrade(55_000),
      bankruptcyPrice: 54_000,
    });
    state = gainSettlement.nextState;

    const payoutSettlement = resolveInsuranceSettlement(state, {
      walletId: WALLET_ID,
      position: mockPosition(),
      liquidationResult: {
        positionId: "BTCUSDT",
        side: "LONG",
        quantity: 1,
        avgEntry: MARK,
        marketPrice: 53_000,
        liquidationPrice: 54_600,
        leverage: 10,
        marginMode: "ISOLATED",
        reason: "EQUITY_BREACH",
      },
      closingTrade: mockClosingTrade(53_000),
      bankruptcyPrice: 54_000,
    });

    expect(payoutSettlement.fundBalance).toBeLessThan(gainSettlement.fundBalance);
    expect(payoutSettlement.nextState.events.length).toBe(2);
  });

  it("fund depletion leaves ADL residual and never negative balance", async () => {
    const state = createEmptyInsuranceFundState(WALLET_ID);
    state.balance = 300;

    const settlement = resolveInsuranceSettlement(state, {
      walletId: WALLET_ID,
      position: mockPosition(),
      liquidationResult: {
        positionId: "BTCUSDT",
        side: "LONG",
        quantity: 1,
        avgEntry: MARK,
        marketPrice: 53_000,
        liquidationPrice: 54_600,
        leverage: 10,
        marginMode: "ISOLATED",
        reason: "EQUITY_BREACH",
      },
      closingTrade: mockClosingTrade(53_000),
      bankruptcyPrice: 54_000,
    });

    expect(settlement.payout).toBe(300);
    expect(settlement.adlResidual).toBe(700);
    expect(settlement.fundBalance).toBe(0);
    expect(settlement.requiresAdl).toBe(true);
  });

  it("settlement events do not affect user wallet balance", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "ISOLATED",
    });
    await engine.buy(1, MARK, MARK);

    const beforePersisted = await storage.load();
    const beforeBalance = resolveWalletBalance(
      beforePersisted.walletCash,
      beforePersisted.trades,
      beforePersisted.financialEvents,
    );

    await insuranceFundRuntime.settleLiquidation(
      WALLET_ID,
      {
        position: mockPosition(),
        liquidationResult: {
          positionId: "BTCUSDT",
          side: "LONG",
          quantity: 1,
          avgEntry: MARK,
          marketPrice: 53_000,
          liquidationPrice: 54_600,
          leverage: 10,
          marginMode: "ISOLATED",
          reason: "EQUITY_BREACH",
        },
        closingTrade: mockClosingTrade(53_000),
        bankruptcyPrice: 54_000,
      },
      storage,
    );

    const afterPersisted = await storage.load();
    const afterBalance = resolveWalletBalance(
      afterPersisted.walletCash,
      afterPersisted.trades,
      afterPersisted.financialEvents,
    );

    expect(afterBalance).toBe(beforeBalance);
    expect(isSettlementOnlyFinancialEvent("INSURANCE_PAYOUT")).toBe(true);
    expect(isSettlementOnlyFinancialEvent("INSURANCE_GAIN")).toBe(true);
  });

  it("persists and reloads insurance fund state", async () => {
    const state = createEmptyInsuranceFundState(WALLET_ID);
    state.balance = 1_000;
    await insuranceFundRuntime.persist(WALLET_ID, state);

    const reloaded = await loadInsuranceFund(WALLET_ID);
    expect(reloaded.balance).toBe(1_000);
    expect(reloaded.walletId).toBe(WALLET_ID);
  });

  it("exposes insurance fund in wallet and account snapshots", async () => {
    const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "ISOLATED",
    });
    const liquidationEngine = createLiquidationEngine(engine, {
      walletId: WALLET_ID,
      storage,
    });
    const priceFeed = createMutablePriceFeed(MARK);

    await engine.buy(1, MARK, MARK);
    priceFeed.setPrice(53_000);
    await createRiskScheduler(engine, liquidationEngine, priceFeed).tick();

    const walletService = new WalletService();
    const perpWallet = await walletService.getPerpWallet(WALLET_ID, 53_000);
    expect(perpWallet.insuranceFundBalance).toBe(0);
    expect(perpWallet.insuranceFundExposure).toBeGreaterThan(0);
    expect(perpWallet.insuranceFundHistory.length).toBeGreaterThan(0);

    const accountSnapshot = buildPortfolioAccountSnapshot({
      accountId: WALLET_ID,
      markPrice: 53_000,
      spotWallet: {
        accountId: WALLET_ID,
        usdtFree: 0,
        usdtLocked: 0,
        usdtTotal: 0,
        balances: [],
      },
      spotPositions: [],
      perpWallet,
      perpPositions: [],
    });

    expect(accountSnapshot.insuranceFundBalance).toBe(0);
    expect(accountSnapshot.insuranceFundDelta24h).toBeDefined();
  });

  it("stress: sequential liquidations keep fund balance non-negative", async () => {
    for (let i = 0; i < 20; i++) {
      memoryStore.clear();
      const walletId = `ins_stress_${i}`;
      const storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
      const engine = createPortfolioEngine(storage, new PaperBroker(), {
        leverage: 10,
        marginMode: "ISOLATED",
      });
      const liquidationEngine = createLiquidationEngine(engine, {
        walletId,
        storage,
      });
      const priceFeed = createMutablePriceFeed(MARK);

      await engine.buy(0.1, MARK, MARK);
      priceFeed.setPrice(53_000 - i * 10);
      await createRiskScheduler(engine, liquidationEngine, priceFeed).tick();

      const fund = await loadInsuranceFund(walletId);
      expect(fund.balance).toBeGreaterThanOrEqual(0);
    }
  });
});
