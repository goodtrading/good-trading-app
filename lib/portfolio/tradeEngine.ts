import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  computeExecutionFees,
  createZeroTradeFees,
  executionFeeToTradeRecord,
} from "@/lib/portfolio/fees/FeeModel";
import { resolveWalletBalanceFromTrades } from "@/lib/portfolio/fees/resolveWalletBalance";
import type {
  BrokerOrderParams,
  Trade,
  TradeSide,
  TradeSource,
} from "@/lib/portfolio/types";
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
  fees?: import("@/lib/portfolio/fees/types").TradeFeeRecord;
  leverage?: number;
  positionMode?: Trade["positionMode"];
  marginMode?: Trade["marginMode"];
  liquidation?: boolean;
  reduceOnly?: boolean;
  postOnly?: boolean;
  executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
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
    fees: args.fees ?? createZeroTradeFees(),
    ...(args.leverage != null ? { leverage: args.leverage } : {}),
    ...(args.positionMode != null ? { positionMode: args.positionMode } : {}),
    ...(args.marginMode != null ? { marginMode: args.marginMode } : {}),
    ...(args.liquidation ? { liquidation: true } : {}),
    ...(args.reduceOnly ? { reduceOnly: true } : {}),
    ...(args.postOnly ? { postOnly: true } : {}),
    ...(args.executionLiquidity ? { executionLiquidity: args.executionLiquidity } : {}),
  };
}

/** Attach FeeModel execution fees to a trade before ledger persistence. */
export function attachExecutionFees(
  trade: Trade,
  context: {
    quantityBefore: number;
    quantityAfter: number;
    executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
  },
): Trade {
  const executionLiquidity =
    trade.executionLiquidity ?? context.executionLiquidity ?? "UNKNOWN";

  const execution = computeExecutionFees({
    side: trade.side,
    quantity: trade.quantity,
    price: trade.price,
    quantityBefore: context.quantityBefore,
    quantityAfter: context.quantityAfter,
    executionLiquidity,
  });
  return {
    ...trade,
    executionLiquidity,
    fees: executionFeeToTradeRecord(execution),
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

/**
 * Futures wallet balance: walletCash + realizedPnL − totalFees.
 * Kept as calculateCashBalance name for call-site compatibility — not spot cash.
 */
export function calculateCashBalance(walletCash: number, trades: Trade[]): number {
  return resolveWalletBalanceFromTrades(walletCash, trades);
}
