import type { BrokerOrderParams, Trade } from "@/lib/portfolio/types";

/**
 * Common execution surface for every broker adapter.
 * Portfolio Engine depends on this interface — not on Paper, Binance or BingX.
 */
export interface Broker {
  buy(params: BrokerOrderParams): Promise<Trade>;
  sell(params: BrokerOrderParams): Promise<Trade>;
  getTrades(): Promise<Trade[]>;
}

export type { BrokerOrderParams };
