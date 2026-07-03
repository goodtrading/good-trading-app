import type { Broker } from "@/lib/portfolio/brokers/Broker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import { createTrade } from "@/lib/portfolio/tradeEngine";
import type { BrokerOrderParams, Trade } from "@/lib/portfolio/types";

/**
 * Simulated spot broker — records trades in memory.
 * Persistence is owned by PortfolioEngine + PortfolioStorage.
 */
export class PaperBroker implements Broker {
  private trades: Trade[] = [];

  async buy(params: BrokerOrderParams): Promise<Trade> {
    const trade = createTrade({
      ...params,
      side: "BUY",
      source: "PAPER",
    });
    this.trades.push(trade);
    return trade;
  }

  async sell(params: BrokerOrderParams): Promise<Trade> {
    const trade = createTrade({
      ...params,
      side: "SELL",
      source: "PAPER",
    });
    this.trades.push(trade);
    return trade;
  }

  async getTrades(): Promise<Trade[]> {
    return [...this.trades].sort((left, right) => left.timestamp - right.timestamp);
  }

  /** Rehydrate broker ledger after storage load. */
  hydrate(trades: Trade[]): void {
    this.trades = [...trades].sort((left, right) => left.timestamp - right.timestamp);
  }

  /** V1 default symbol guard for callers. */
  static defaultSymbol(): string {
    return PORTFOLIO_V1_SYMBOL;
  }
}
