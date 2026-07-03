import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { BrokerOrderParams, Trade, TradeSide, TradeSource } from "@/lib/portfolio/types";

export class TradeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeValidationError";
  }
}

function createTradeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function assertV1Symbol(symbol: string): void {
  if (symbol !== PORTFOLIO_V1_SYMBOL) {
    throw new TradeValidationError(`V1 only supports ${PORTFOLIO_V1_SYMBOL}`);
  }
}

export function assertPositiveQuantity(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new TradeValidationError("Quantity must be greater than zero");
  }
}

export function assertPositivePrice(price: number): void {
  if (!Number.isFinite(price) || price <= 0) {
    throw new TradeValidationError("Price must be greater than zero");
  }
}

export function createTrade(args: {
  symbol: string;
  side: TradeSide;
  quantity: number;
  price: number;
  source: TradeSource;
  timestamp?: number;
  fees?: number;
}): Trade {
  assertV1Symbol(args.symbol);
  assertPositiveQuantity(args.quantity);
  assertPositivePrice(args.price);

  return {
    id: createTradeId(),
    symbol: args.symbol,
    side: args.side,
    quantity: args.quantity,
    price: args.price,
    timestamp: args.timestamp ?? Date.now(),
    source: args.source,
    ...(args.fees != null ? { fees: args.fees } : {}),
  };
}

export function validateBrokerOrderParams(params: BrokerOrderParams): void {
  assertV1Symbol(params.symbol);
  assertPositiveQuantity(params.quantity);
  assertPositivePrice(params.price);
}

export function sortTradesChronologically(trades: Trade[]): Trade[] {
  return [...trades].sort((left, right) => left.timestamp - right.timestamp);
}

export function calculateCashBalance(initialCashBalance: number, trades: Trade[]): number {
  return sortTradesChronologically(trades).reduce((cash, trade) => {
    const notional = trade.quantity * trade.price;
    return trade.side === "BUY" ? cash - notional : cash + notional;
  }, initialCashBalance);
}
