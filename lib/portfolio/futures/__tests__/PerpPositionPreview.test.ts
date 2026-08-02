import { describe, expect, it, beforeEach } from "vitest";

import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { buildPortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  buildPerpPositionPreview,
  perpPreviewToTradeEntrySummary,
} from "@/lib/portfolio/futures/PerpPositionPreview";
import { marginRatioAtEntry } from "@/lib/portfolio/futures/futuresAccounting";
import { ZERO_FUNDING_SNAPSHOT, ZERO_MAKER_TAKER_SNAPSHOT, ZERO_POST_ONLY_SNAPSHOT, ZERO_REDUCE_ONLY_SNAPSHOT } from "@/lib/portfolio/fees/__tests__/feeTestHelpers";
import { createPortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  createEmptyPersistedState,
  MemoryPortfolioStorage,
} from "@/lib/portfolio/storage/portfolioStorage";
import type { PortfolioAccountSnapshot } from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import type { MarginMode } from "@/lib/portfolio/types";

const MARK = 60_000;

function snapshotFromEngine(
  accountId: string,
  state: Awaited<ReturnType<ReturnType<typeof createPortfolioEngine>["getState"]>>,
  markPrice: number,
): PortfolioAccountSnapshot {
  const perp = state.portfolio;
  return buildPortfolioAccountSnapshot({
    accountId,
    markPrice,
    spotWallet: {
      accountId,
      usdtFree: 0,
      usdtLocked: 0,
      usdtTotal: 0,
      balances: [],
    },
    spotPositions: [],
    perpWallet: {
      accountId,
      initialCashBalance: state.initialCashBalance,
      walletCash: state.walletCash,
      walletBalance: perp.walletBalance,
      availableBalance: perp.cashBalance,
      equity: perp.equity,
      marginUsed: perp.marginUsed,
      realizedPnL: perp.realizedPnL,
      unrealizedPnL: perp.unrealizedPnL,
      feesPaid: 0,
      feesToday: 0,
      openingFees: 0,
      closingFees: 0,
      fundingFees: 0,
      totalFees: 0,
      estimatedOpeningFee: 0,
      estimatedClosingFee: 0,
      financialEvents: [],
      fundingPaid: 0,
      rebates: 0,
      insurance: 0,
      adl: 0,
      manualAdjustments: 0,
      ...ZERO_FUNDING_SNAPSHOT,
      ...ZERO_REDUCE_ONLY_SNAPSHOT,
      ...ZERO_POST_ONLY_SNAPSHOT,
      ...ZERO_MAKER_TAKER_SNAPSHOT,
    },
    perpPositions: state.positions,
  });
}

function previewArgs(args: {
  margin: number;
  leverage: number;
  marginMode: MarginMode;
  direction?: "LONG" | "SHORT";
  entryPrice?: number;
  markPrice?: number;
  snapshot: PortfolioAccountSnapshot;
  existingTrades?: import("@/lib/portfolio/types").Trade[];
}) {
  return {
    direction: args.direction ?? ("LONG" as const),
    margin: args.margin,
    entryPrice: args.entryPrice ?? MARK,
    markPrice: args.markPrice ?? MARK,
    leverage: args.leverage,
    marginMode: args.marginMode,
    accountSnapshot: args.snapshot,
    existingTrades: args.existingTrades,
  };
}

describe("PerpPositionPreview", () => {
  let storage: MemoryPortfolioStorage;
  const accountId = "acc-preview";

  beforeEach(() => {
    storage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
  });

  it.each([
    { label: "Cross 10x", leverage: 10, marginMode: "CROSS" as const },
    { label: "Cross 50x", leverage: 50, marginMode: "CROSS" as const },
    { label: "Cross 125x", leverage: 125, marginMode: "CROSS" as const },
    { label: "Isolated", leverage: 10, marginMode: "ISOLATED" as const },
  ])("$label — position value is |qty| × mark", async ({ leverage, marginMode }) => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage,
      marginMode,
      positionMode: "LONG_SHORT",
    });
    const before = await engine.getState(MARK);
    const snapshot = snapshotFromEngine(accountId, before, MARK);
    const margin = 6_000;
    const markPrice = 62_000;

    const preview = buildPerpPositionPreview(
      previewArgs({
        margin,
        leverage,
        marginMode,
        snapshot,
        entryPrice: MARK,
        markPrice,
      }),
    )!;

    expect(preview.positionValue).toBe(preview.quantity * markPrice);
    expect(preview.positionValue).not.toBe(margin * leverage);
    expect(preview.positionMarginRatio).not.toBeCloseTo(marginRatioAtEntry(leverage), 1);
  });

  it("LONG preview matches engine position after execute", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "CROSS",
    });
    const before = await engine.getState(MARK);
    const snapshot = snapshotFromEngine(accountId, before, MARK);
    const margin = 6_000;

    const preview = buildPerpPositionPreview(
      previewArgs({ margin, leverage: 10, marginMode: "CROSS", snapshot }),
    )!;

    await engine.buy(preview.quantity, MARK, MARK);
    const after = await engine.getState(MARK);
    const pos = after.positions[0]!;

    expect(preview.positionValue).toBe(pos.positionValue);
    expect(preview.entryMargin).toBeCloseTo(pos.entryMargin, 4);
    expect(preview.maintenanceMargin).toBe(pos.maintenanceMargin);
    expect(preview.positionMarginRatio).toBe(pos.marginRatio);
    expect(preview.liquidationPrice).toBe(pos.liquidationPrice);
    expect(preview.roi).toBe(pos.roiPercent);
    expect(preview.unrealizedPnL).toBeCloseTo(pos.unrealizedPnL, 4);
    expect(preview.marginUsed).toBe(pos.entryMargin);
  });

  it("SHORT preview matches engine position after execute", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "ISOLATED",
      positionMode: "LONG_SHORT",
    });
    const before = await engine.getState(MARK);
    const snapshot = snapshotFromEngine(accountId, before, MARK);
    const margin = 6_000;

    const preview = buildPerpPositionPreview(
      previewArgs({
        margin,
        leverage: 10,
        marginMode: "ISOLATED",
        direction: "SHORT",
        snapshot,
      }),
    )!;

    await engine.sell(preview.quantity, MARK, MARK);
    const after = await engine.getState(MARK);
    const pos = after.positions[0]!;

    expect(preview.positionValue).toBe(pos.positionValue);
    expect(preview.entryMargin).toBeCloseTo(pos.entryMargin, 4);
    expect(preview.liquidationPrice).toBe(pos.liquidationPrice);
    expect(preview.positionMarginRatio).toBe(pos.marginRatio);
  });

  it("margin ratio changes when mark diverges from entry", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), { leverage: 20 });
    const before = await engine.getState(MARK);
    const snapshot = snapshotFromEngine(accountId, before, MARK);

    const atEntry = buildPerpPositionPreview(
      previewArgs({ margin: 3_000, leverage: 20, marginMode: "CROSS", snapshot }),
    )!;
    const up = buildPerpPositionPreview(
      previewArgs({
        margin: 3_000,
        leverage: 20,
        marginMode: "CROSS",
        snapshot,
        markPrice: 65_000,
      }),
    )!;

    expect(up.positionMarginRatio).toBeLessThan(atEntry.positionMarginRatio);
    expect(up.roi).toBeGreaterThan(0);
  });

  it("wallet preview uses calculateAvailableBalance from domain", async () => {
    const engine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "CROSS",
    });
    const before = await engine.getState(MARK);
    const snapshot = snapshotFromEngine(accountId, before, MARK);

    const preview = buildPerpPositionPreview(
      previewArgs({ margin: 6_000, leverage: 10, marginMode: "CROSS", snapshot }),
    )!;

    await engine.buy(preview.quantity, MARK, MARK);
    const after = await engine.getState(MARK);

    expect(preview.walletBalance).toBe(after.portfolio.walletBalance);
    expect(preview.equity).toBe(after.portfolio.equity);
    expect(preview.availableBalance).toBe(after.portfolio.cashBalance);
    expect(preview.marginUsed).toBe(after.portfolio.marginUsed);
  });

  it("isolated vs cross available balance preview differs when mark ≠ entry", async () => {
    const crossEngine = createPortfolioEngine(storage, new PaperBroker(), {
      leverage: 10,
      marginMode: "CROSS",
    });
    const crossBefore = await crossEngine.getState(MARK);
    const crossSnap = snapshotFromEngine(accountId, crossBefore, MARK);

    const isoStorage = new MemoryPortfolioStorage(createEmptyPersistedState(500_000));
    const isoEngine = createPortfolioEngine(isoStorage, new PaperBroker(), {
      leverage: 10,
      marginMode: "ISOLATED",
    });
    const isoBefore = await isoEngine.getState(MARK);
    const isoSnap = snapshotFromEngine(accountId, isoBefore, MARK);

    const margin = 6_000;
    const markPrice = 65_000;
    const crossPreview = buildPerpPositionPreview(
      previewArgs({
        margin,
        leverage: 10,
        marginMode: "CROSS",
        snapshot: crossSnap,
        entryPrice: MARK,
        markPrice,
      }),
    )!;
    const isoPreview = buildPerpPositionPreview(
      previewArgs({
        margin,
        leverage: 10,
        marginMode: "ISOLATED",
        snapshot: isoSnap,
        entryPrice: MARK,
        markPrice,
      }),
    )!;

    expect(crossPreview.availableBalance).toBeGreaterThan(
      isoPreview.availableBalance,
    );
  });

  it("perpPreviewToTradeEntrySummary maps all PERP fields", () => {
    const preview = buildPerpPositionPreview({
      direction: "LONG",
      margin: 1_000,
      entryPrice: MARK,
      markPrice: MARK,
      leverage: 10,
      marginMode: "CROSS",
      accountSnapshot: buildPortfolioAccountSnapshot({
        accountId,
        markPrice: MARK,
        spotWallet: {
          accountId,
          usdtFree: 0,
          usdtLocked: 0,
          usdtTotal: 0,
          balances: [],
        },
        spotPositions: [],
        perpWallet: {
          accountId,
          initialCashBalance: 500_000,
          walletCash: 500_000,
          walletBalance: 500_000,
          availableBalance: 500_000,
          equity: 500_000,
          marginUsed: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          feesPaid: 0,
          feesToday: 0,
          openingFees: 0,
          closingFees: 0,
          fundingFees: 0,
          totalFees: 0,
          estimatedOpeningFee: 0,
          estimatedClosingFee: 0,
          financialEvents: [],
          fundingPaid: 0,
          rebates: 0,
          insurance: 0,
          adl: 0,
          manualAdjustments: 0,
        },
        perpPositions: [],
      }),
    })!;

    const summary = perpPreviewToTradeEntrySummary(preview);
    expect(summary.positionValue).toBe(preview.positionValue);
    expect(summary.positionMarginRatio).toBe(preview.positionMarginRatio);
    expect(summary.roi).toBe(preview.roi);
    expect(summary.estimatedLiquidation).toBe(preview.liquidationPrice);
    expect(summary.availableBalanceAfterTrade).toBe(preview.availableBalance);
  });

  it("ROI is finite for all leverage levels", () => {
    const snapshot = buildPortfolioAccountSnapshot({
      accountId,
      markPrice: MARK,
      spotWallet: {
        accountId,
        usdtFree: 0,
        usdtLocked: 0,
        usdtTotal: 0,
        balances: [],
      },
      spotPositions: [],
      perpWallet: {
        accountId,
        initialCashBalance: 500_000,
        walletCash: 500_000,
        walletBalance: 500_000,
        availableBalance: 500_000,
        equity: 500_000,
        marginUsed: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        feesPaid: 0,
        feesToday: 0,
        openingFees: 0,
        closingFees: 0,
        fundingFees: 0,
        totalFees: 0,
        estimatedOpeningFee: 0,
        estimatedClosingFee: 0,
        financialEvents: [],
        fundingPaid: 0,
        rebates: 0,
        insurance: 0,
        adl: 0,
        manualAdjustments: 0,
        ...ZERO_FUNDING_SNAPSHOT,
        ...ZERO_REDUCE_ONLY_SNAPSHOT,
      ...ZERO_POST_ONLY_SNAPSHOT,
      ...ZERO_MAKER_TAKER_SNAPSHOT,
      },
      perpPositions: [],
    });

    for (const leverage of [10, 50, 125]) {
      const preview = buildPerpPositionPreview(
        previewArgs({ margin: 1_000, leverage, marginMode: "CROSS", snapshot }),
      )!;
      expect(Number.isFinite(preview.roi)).toBe(true);
      expect(Number.isFinite(preview.positionMarginRatio)).toBe(true);
    }
  });
});
