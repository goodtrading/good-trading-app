import type { Broker } from "@/lib/portfolio/brokers/Broker";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  createExecutionEngine,
  type ExecutionEngine,
  type ExecutionResult,
} from "@/lib/portfolio/execution/ExecutionEngine";
import type { MatchingEngine } from "@/lib/portfolio/matching/MatchingEngine";
import { validateBrokerOrderParams } from "@/lib/portfolio/tradeEngine";
import type { Trade, TradeSide } from "@/lib/portfolio/types";

export type OrderSide = TradeSide;
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED";

/**
 * Intermediate order entity.
 * MARKET fills immediately via ExecutionEngine.
 * LIMIT is parked OPEN on MatchingEngine until price triggers a fill.
 * Persistence remains Trade → Ledger; orders are not written to storage in this stage.
 */
export type Order = {
  id: string;
  symbol: typeof PORTFOLIO_V1_SYMBOL;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  status: OrderStatus;
  createdAt: number;
};

export type CreateMarketOrderInput = {
  side: OrderSide;
  quantity: number;
  price: number;
};

export type CreateLimitOrderInput = {
  side: OrderSide;
  quantity: number;
  price: number;
};

export type MarketOrderResult = {
  order: Order;
  trade: Trade;
};

export type CreateOrderResult = ExecutionResult;

function createOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildOrder(args: {
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number;
  status: OrderStatus;
}): Order {
  return {
    id: createOrderId(),
    symbol: PORTFOLIO_V1_SYMBOL,
    side: args.side,
    type: args.type,
    quantity: args.quantity,
    price: args.price,
    status: args.status,
    createdAt: Date.now(),
  };
}

/**
 * Entry layer for trading intents.
 * Creates orders and delegates execution to ExecutionEngine.
 * Does not call Broker or write to the ledger.
 */
export class OrderEngine {
  private readonly executionEngine: ExecutionEngine;

  constructor(executionEngine: ExecutionEngine) {
    this.executionEngine = executionEngine;
  }

  /**
   * Creates a market order and sends it to ExecutionEngine for immediate fill.
   */
  async createMarketOrder(input: CreateMarketOrderInput): Promise<MarketOrderResult> {
    validateBrokerOrderParams({
      symbol: PORTFOLIO_V1_SYMBOL,
      quantity: input.quantity,
      price: input.price,
    });

    const order = buildOrder({
      side: input.side,
      type: "MARKET",
      quantity: input.quantity,
      price: input.price,
      status: "OPEN",
    });

    console.log("[ORDER CREATED]", {
      orderId: order.id,
      type: order.type,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
    });

    console.log("[ORDER SENT TO EXECUTION]", {
      orderId: order.id,
      type: order.type,
    });

    const result = await this.executionEngine.execute(order);
    if (result.trade == null) {
      throw new Error("Market order execution did not produce a trade");
    }

    return { order: result.order, trade: result.trade };
  }

  /**
   * Creates a limit order and sends it to ExecutionEngine.
   * Parked OPEN on MatchingEngine until onPriceUpdate triggers a match.
   */
  async createLimitOrder(input: CreateLimitOrderInput): Promise<CreateOrderResult> {
    validateBrokerOrderParams({
      symbol: PORTFOLIO_V1_SYMBOL,
      quantity: input.quantity,
      price: input.price,
    });

    const order = buildOrder({
      side: input.side,
      type: "LIMIT",
      quantity: input.quantity,
      price: input.price,
      status: "OPEN",
    });

    console.log("[ORDER CREATED]", {
      orderId: order.id,
      type: order.type,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
    });

    console.log("[ORDER SENT TO EXECUTION]", {
      orderId: order.id,
      type: order.type,
    });

    return this.executionEngine.execute(order);
  }
}

export function createOrderEngine(
  broker: Broker,
  matchingEngine: MatchingEngine,
): OrderEngine {
  return new OrderEngine(createExecutionEngine(broker, matchingEngine));
}
