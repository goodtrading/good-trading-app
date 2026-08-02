import type { Broker } from "@/lib/portfolio/brokers/Broker";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import {
  createPortfolioEngine,
  type PortfolioEngine,
  type PortfolioEngineOptions,
} from "@/lib/portfolio/portfolioEngine";
import {
  createLiquidationEngine,
  type LiquidationEngine,
} from "@/lib/portfolio/risk/LiquidationEngine";
import {
  createFundingScheduler,
  type FundingClock,
  type FundingScheduler,
} from "@/lib/portfolio/funding/FundingScheduler";
import {
  createRiskScheduler,
  type RiskPriceFeed,
  type RiskScheduler,
} from "@/lib/portfolio/risk/RiskScheduler";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import type { MarginMode, PositionMode } from "@/lib/portfolio/types";

export type PortfolioEngineBootstrapConfig = {
  /** Per-account or default portfolio storage (ledger). */
  storage: PortfolioStorage;
  /** Autonomous price source for RiskScheduler. */
  priceFeed: RiskPriceFeed;
  /** Defaults to PaperBroker. */
  broker?: Broker;
  positionMode?: PositionMode;
  leverage?: number;
  marginMode?: MarginMode;
  /** Paper wallet id — used to cancel TP/SL on liquidation. */
  walletId?: string;
  /** RiskScheduler interval. Default 1000ms. */
  riskIntervalMs?: number;
  /** When true (default), RiskScheduler starts immediately. */
  autoStartRisk?: boolean;
  /** When true, FundingScheduler starts immediately. Default false. */
  autoStartFunding?: boolean;
  /** FundingScheduler interval. Default 60_000ms. */
  fundingIntervalMs?: number;
  /** Injectable clock for funding (tests). */
  fundingClock?: FundingClock;
};

/**
 * Single controlled entry point for the Cartera trading engine stack.
 *
 * Wires:
 *   PortfolioEngine
 *     ├─ MatchingEngine
 *     ├─ OrderEngine
 *     │    └─ ExecutionEngine
 *     └─ Broker
 *   LiquidationEngine
 *   RiskScheduler ← PriceFeed
 *   FundingScheduler ← PriceFeed (optional)
 *
 * Lifecycle: start(config) → getEngine() / tick risk → stop()
 */
export class PortfolioEngineBootstrap {
  private engine: PortfolioEngine | null = null;
  private liquidationEngine: LiquidationEngine | null = null;
  private riskScheduler: RiskScheduler | null = null;
  private fundingScheduler: FundingScheduler | null = null;
  private priceFeed: RiskPriceFeed | null = null;
  private broker: Broker | null = null;
  private started = false;

  start(config: PortfolioEngineBootstrapConfig): PortfolioEngine {
    // Always clear prior risk interval / references before (re)start.
    if (this.started) {
      this.stop();
    }

    const broker = config.broker ?? new PaperBroker();
    const engineOptions: PortfolioEngineOptions = {
      positionMode: config.positionMode,
      leverage: config.leverage,
      marginMode: config.marginMode,
    };

    const engine = createPortfolioEngine(config.storage, broker, engineOptions);
    // Linked TP/SL cancel runs inside ExecutionRouter FORCE_LIQUIDATE.
    const liquidationEngine = createLiquidationEngine(engine, {
      walletId: config.walletId,
      storage: config.storage,
    });
    const riskScheduler = createRiskScheduler(
      engine,
      liquidationEngine,
      config.priceFeed,
    );
    const fundingScheduler = createFundingScheduler(
      engine,
      config.storage,
      config.priceFeed,
      { clock: config.fundingClock },
    );

    this.engine = engine;
    this.liquidationEngine = liquidationEngine;
    this.riskScheduler = riskScheduler;
    this.fundingScheduler = fundingScheduler;
    this.priceFeed = config.priceFeed;
    this.broker = broker;
    this.started = true;

    const autoStartRisk = config.autoStartRisk ?? true;
    if (autoStartRisk) {
      riskScheduler.start(config.riskIntervalMs ?? 1000);
    }

    if (config.autoStartFunding) {
      fundingScheduler.start(config.fundingIntervalMs ?? 60_000);
    }

    console.log("[ENGINE BOOTSTRAP STARTED]", {
      positionMode: engine.getPositionMode(),
      leverage: engine.getLeverage(),
      riskRunning: riskScheduler.isRunning(),
      riskIntervalMs: config.riskIntervalMs ?? 1000,
    });

    return engine;
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.riskScheduler?.stop();
    this.fundingScheduler?.stop();

    console.log("[ENGINE BOOTSTRAP STOPPED]");

    this.engine = null;
    this.liquidationEngine = null;
    this.riskScheduler = null;
    this.fundingScheduler = null;
    this.priceFeed = null;
    this.broker = null;
    this.started = false;
  }

  isStarted(): boolean {
    return this.started;
  }

  getEngine(): PortfolioEngine {
    if (!this.engine) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.engine;
  }

  getLiquidationEngine(): LiquidationEngine {
    if (!this.liquidationEngine) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.liquidationEngine;
  }

  getRiskScheduler(): RiskScheduler {
    if (!this.riskScheduler) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.riskScheduler;
  }

  getFundingScheduler(): FundingScheduler {
    if (!this.fundingScheduler) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.fundingScheduler;
  }

  getPriceFeed(): RiskPriceFeed {
    if (!this.priceFeed) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.priceFeed;
  }

  getBroker(): Broker {
    if (!this.broker) {
      throw new Error("PortfolioEngineBootstrap: not started. Call start(config) first.");
    }
    return this.broker;
  }
}

export function createPortfolioEngineBootstrap(): PortfolioEngineBootstrap {
  return new PortfolioEngineBootstrap();
}
