import type { Broker } from "@/lib/portfolio/brokers/Broker";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { buildPosition, buildPositions } from "@/lib/portfolio/positionEngine";import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import {
  calculateCashBalance,
  sortTradesChronologically,
  validateBrokerOrderParams,
} from "@/lib/portfolio/tradeEngine";
import type {
  Portfolio,
  PortfolioEngineState,
  PortfolioPersistedState,
} from "@/lib/portfolio/types";

export class InsufficientCashError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient cash: need ${required}, available ${available}`);
    this.name = "InsufficientCashError";
  }
}

export class InsufficientPositionError extends Error {
  constructor(required: number, available: number) {
    super(`Insufficient position: need ${required}, available ${available}`);
    this.name = "InsufficientPositionError";
  }
}

function buildPortfolioSummary(
  initialCashBalance: number,
  trades: ReturnType<typeof sortTradesChronologically>,
  marketPrice: number,
): Portfolio {
  const cashBalance = calculateCashBalance(initialCashBalance, trades);
  const position = buildPosition(trades, marketPrice);
  const holdingsValue = position ? position.quantity * marketPrice : 0;
  const equity = cashBalance + holdingsValue;
  const unrealizedPnL = position?.unrealizedPnL ?? 0;
  const realizedPnL = position?.realizedPnL ?? 0;
  const totalReturnPercent =
    initialCashBalance > 0
      ? Number((((equity - initialCashBalance) / initialCashBalance) * 100).toFixed(4))
      : 0;

  return {
    cashBalance,
    equity,
    realizedPnL,
    unrealizedPnL,
    totalReturnPercent,
  };
}

export function deriveEngineState(
  persisted: PortfolioPersistedState,
  marketPrice: number,
): PortfolioEngineState {
  const trades = sortTradesChronologically(persisted.trades);
  const portfolio = buildPortfolioSummary(persisted.initialCashBalance, trades, marketPrice);
  const positions = buildPositions(trades, marketPrice);

  return {
    portfolio,
    positions,
    trades,
    initialCashBalance: persisted.initialCashBalance,
  };
}

export class PortfolioEngine {
  constructor(
    private readonly broker: Broker,
    private readonly storage: PortfolioStorage,
  ) {}

  async getState(marketPrice: number): Promise<PortfolioEngineState> {
    const persisted = await this.storage.load();
    await this.syncBrokerTrades(persisted.trades);
    return deriveEngineState(persisted, marketPrice);
  }

  async buy(quantity: number, price: number, marketPrice: number): Promise<PortfolioEngineState> {
    validateBrokerOrderParams({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });

    const tx = await beginLedgerTransaction(this.storage);
    try {
      const persisted = tx.base;
      const cashBalance = calculateCashBalance(persisted.initialCashBalance, tx.workingTrades());
      const cost = quantity * price;

      if (cost > cashBalance) {
        throw new InsufficientCashError(cost, cashBalance);
      }

      const trade = await this.broker.buy({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });
      tx.appendTrade(trade);
      const nextState = await tx.commit();
      return deriveEngineState(nextState, marketPrice);
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  async sell(quantity: number, price: number, marketPrice: number): Promise<PortfolioEngineState> {
    validateBrokerOrderParams({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });

    const tx = await beginLedgerTransaction(this.storage);
    try {
      const persisted = tx.base;
      const openPosition = buildPosition(tx.workingTrades(), price);

      if (!openPosition || openPosition.quantity < quantity) {
        throw new InsufficientPositionError(quantity, openPosition?.quantity ?? 0);
      }

      const trade = await this.broker.sell({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });
      tx.appendTrade(trade);
      const nextState = await tx.commit();
      return deriveEngineState(nextState, marketPrice);
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  private async syncBrokerTrades(trades: PortfolioPersistedState["trades"]): Promise<void> {
    if (this.broker instanceof PaperBroker) {
      this.broker.hydrate(trades);
    }
    await this.broker.getTrades();
  }
}

export function createPortfolioEngine(
  storage: PortfolioStorage,
  broker: Broker = new PaperBroker(),
): PortfolioEngine {
  return new PortfolioEngine(broker, storage);
}
