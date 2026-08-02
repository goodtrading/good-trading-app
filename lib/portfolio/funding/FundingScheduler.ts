import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  computeFundingRate,
  getLastFundingTime,
  isFundingDue,
  nextFundingTimestamp,
  settleFunding,
} from "@/lib/portfolio/funding/FundingEngine";
import { DEFAULT_FUNDING_SCHEDULE } from "@/lib/portfolio/funding/FundingSchedule";
import type { FundingSchedule } from "@/lib/portfolio/funding/types";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import type { RiskPriceFeed } from "@/lib/portfolio/risk/RiskScheduler";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";

export type FundingClock = {
  now(): number;
};

export type FundingSchedulerHooks = {
  onFundingSettled?: (eventId: string) => Promise<void> | void;
};

/**
 * Autonomous funding loop — injectable clock, no system clock dependency in tests.
 */
export class FundingScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isTicking = false;

  constructor(
    private readonly portfolioEngine: PortfolioEngine,
    private readonly storage: PortfolioStorage,
    private readonly priceFeed: RiskPriceFeed,
    private readonly clock: FundingClock = { now: () => Date.now() },
    private readonly schedule: FundingSchedule = DEFAULT_FUNDING_SCHEDULE,
    private readonly hooks: FundingSchedulerHooks = {},
  ) {}

  start(intervalMs: number = 60_000): void {
    if (this.timer != null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer == null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer != null;
  }

  async lastFundingTime(): Promise<number | null> {
    const persisted = await this.storage.load();
    return getLastFundingTime(persisted.financialEvents);
  }

  async nextFundingTimestamp(): Promise<number> {
    const last = await this.lastFundingTime();
    return nextFundingTimestamp(last, this.clock.now(), this.schedule);
  }

  async isFundingDue(): Promise<boolean> {
    const price = this.priceFeed.getLastPrice();
    if (price == null || !(price > 0)) return false;

    const positions = await this.portfolioEngine.getOpenPositions(price);
    if (positions.length === 0) return false;

    const last = await this.lastFundingTime();
    return isFundingDue(last, this.clock.now(), this.schedule);
  }

  /** Settle one funding cycle if due. Returns true when an event was persisted. */
  async runFunding(): Promise<boolean> {
    const price = this.priceFeed.getLastPrice();
    if (price == null || !(price > 0)) return false;

    const positions = await this.portfolioEngine.getOpenPositions(price);
    const open = positions.find((p) => p.symbol === PORTFOLIO_V1_SYMBOL && p.quantity !== 0);
    if (!open) return false;

    const timestamp = this.clock.now();
    const fundingRate = computeFundingRate(this.schedule);
    const event = settleFunding({
      quantity: open.quantity,
      markPrice: price,
      fundingRate,
      symbol: PORTFOLIO_V1_SYMBOL,
      timestamp,
      schedule: this.schedule,
    });
    if (!event) return false;

    const persisted = await this.storage.load();
    const exists = (persisted.financialEvents ?? []).some((e) => e.id === event.id);
    if (exists) return false;

    const tx = await beginLedgerTransaction(this.storage);
    try {
      tx.appendFinancialEvent(event);
      await tx.commit();
      await this.hooks.onFundingSettled?.(event.id);
      return true;
    } catch {
      tx.rollback();
      return false;
    }
  }

  /** Process all due funding cycles (catch-up safe for injected clocks). */
  async tick(): Promise<number> {
    if (this.isTicking) return 0;
    this.isTicking = true;
    let settled = 0;
    try {
      const maxCycles = 64;
      for (let i = 0; i < maxCycles && (await this.isFundingDue()); i += 1) {
        const ok = await this.runFunding();
        if (!ok) break;
        settled += 1;
      }
    } finally {
      this.isTicking = false;
    }
    return settled;
  }
}

export function createFundingScheduler(
  portfolioEngine: PortfolioEngine,
  storage: PortfolioStorage,
  priceFeed: RiskPriceFeed,
  options: {
    clock?: FundingClock;
    schedule?: FundingSchedule;
    hooks?: FundingSchedulerHooks;
  } = {},
): FundingScheduler {
  return new FundingScheduler(
    portfolioEngine,
    storage,
    priceFeed,
    options.clock,
    options.schedule,
    options.hooks,
  );
}
