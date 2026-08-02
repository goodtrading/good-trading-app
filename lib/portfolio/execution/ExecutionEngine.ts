import type { Broker } from "@/lib/portfolio/brokers/Broker";
import type { MatchingEngine } from "@/lib/portfolio/matching/MatchingEngine";
import type { Order } from "@/lib/portfolio/orders/OrderEngine";
import type { Trade } from "@/lib/portfolio/types";

export type ExecutionResult = {
  trade: Trade | null;
  order: Order;
};

/**
 * Sole execution boundary between orders and the broker / matching book.
 * MARKET fills immediately. LIMIT is parked on the MatchingEngine book.
 */
export class ExecutionEngine {
  constructor(
    private readonly broker: Broker,
    private readonly matchingEngine: MatchingEngine,
  ) {}

  /**
   * MARKET → immediate fill via Broker, status FILLED. Never enters MatchingEngine.
   * LIMIT → add to MatchingEngine book as OPEN, no Trade. Never calls Broker.
   */
  async execute(order: Order): Promise<ExecutionResult> {
    if (order.type === "MARKET") {
      return this.executeMarket(order);
    }

    if (order.type === "LIMIT") {
      return this.parkLimit(order);
    }

    throw new Error(
      `ExecutionEngine: unsupported order type "${String((order as Order).type)}"`,
    );
  }

  private async executeMarket(order: Order): Promise<ExecutionResult> {
    if (order.type !== "MARKET") {
      throw new Error("ExecutionEngine: MARKET path received non-MARKET order");
    }

    if (order.price == null) {
      throw new Error("Market order requires a price");
    }

    const params = {
      symbol: order.symbol,
      quantity: order.quantity,
      price: order.price,
    };

    const trade =
      order.side === "BUY" ? await this.broker.buy(params) : await this.broker.sell(params);

    const result: ExecutionResult = {
      order: {
        ...order,
        status: "FILLED",
      },
      trade,
    };

    console.log("[EXECUTION RESULT]", {
      orderId: result.order.id,
      type: result.order.type,
      status: result.order.status,
      tradeId: trade.id,
    });
    console.log("[TRADE GENERATED | NONE]", {
      orderId: order.id,
      trade: "GENERATED",
      tradeId: trade.id,
    });

    return result;
  }

  private parkLimit(order: Order): ExecutionResult {
    if (order.type !== "LIMIT") {
      throw new Error("ExecutionEngine: LIMIT path received non-LIMIT order");
    }

    if (order.status !== "OPEN") {
      throw new Error("ExecutionEngine: LIMIT orders must enter the book as OPEN");
    }

    const openOrder: Order = {
      ...order,
      status: "OPEN",
    };
    this.matchingEngine.addOrder(openOrder);

    const result: ExecutionResult = {
      order: openOrder,
      trade: null,
    };
    console.log("[EXECUTION RESULT]", {
      orderId: result.order.id,
      type: result.order.type,
      status: result.order.status,
      trade: "NONE",
    });
    console.log("[TRADE GENERATED | NONE]", { orderId: order.id, trade: "NONE" });
    return result;
  }
}

export function createExecutionEngine(
  broker: Broker,
  matchingEngine: MatchingEngine,
): ExecutionEngine {
  return new ExecutionEngine(broker, matchingEngine);
}
