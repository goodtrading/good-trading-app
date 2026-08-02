import type { Broker } from "@/lib/portfolio/brokers/Broker";
import type { Order, OrderStatus } from "@/lib/portfolio/orders/OrderEngine";
import type { Trade } from "@/lib/portfolio/types";

export type MatchResult = {
  filledTrades: Trade[];
  remainingOrders: Order[];
};

export type MatchOptions = {
  /** Optional guard evaluated before filling (cash / position). */
  canFill?: (order: Order) => boolean;
  /** Called after each successful fill so callers can update working balances. */
  onFill?: (trade: Trade, order: Order) => void;
};

function isLimitPriceTriggered(order: Order, marketPrice: number): boolean {
  if (order.price == null) return false;

  if (order.side === "BUY") {
    return marketPrice <= order.price;
  }

  return marketPrice >= order.price;
}

/**
 * In-memory limit-order book.
 * MARKET orders never enter this engine.
 * Source of truth for active LIMIT orders (OPEN).
 */
export class MatchingEngine {
  private limitOrders: Order[] = [];
  private readonly filledOrderIds = new Set<string>();
  private isMatching = false;

  constructor(private readonly broker: Broker) {}

  addOrder(order: Order): void {
    if (order.type !== "LIMIT") {
      throw new Error("MatchingEngine only accepts LIMIT orders (MARKET must never enter the book)");
    }

    if (order.status !== "OPEN") {
      throw new Error("MatchingEngine only accepts OPEN orders");
    }

    if (order.price == null) {
      throw new Error("LIMIT order requires a price");
    }

    if (this.filledOrderIds.has(order.id)) {
      console.log("[ORDER ALREADY FILLED SKIPPED]", { orderId: order.id, reason: "addOrder" });
      throw new Error(`Order already filled: ${order.id}`);
    }

    const exists = this.limitOrders.some((entry) => entry.id === order.id);
    if (exists) {
      throw new Error(`Order already on book: ${order.id}`);
    }

    this.limitOrders.push({
      ...order,
      type: "LIMIT",
      status: "OPEN",
    });

    console.log("[ORDER ADDED TO BOOK]", {
      orderId: order.id,
      side: order.side,
      quantity: order.quantity,
      limitPrice: order.price,
    });
  }

  cancelOrder(orderId: string): void {
    const index = this.limitOrders.findIndex((order) => order.id === orderId);
    if (index === -1) return;

    const order = this.limitOrders[index];
    if (!order) return;

    this.updateOrderState(order, "CANCELLED");
    this.limitOrders.splice(index, 1);
  }

  getOpenOrders(): Order[] {
    return this.limitOrders
      .filter((order) => order.status === "OPEN")
      .map((order) => ({ ...order }));
  }

  /**
   * Centralized order lifecycle transitions.
   * Allowed: OPEN → FILLED | CANCELLED.
   */
  updateOrderState(order: Order, nextStatus: OrderStatus): void {
    if (order.status === nextStatus) return;

    if (order.status !== "OPEN") {
      throw new Error(`Invalid order state transition: ${order.status} → ${nextStatus}`);
    }

    if (nextStatus !== "FILLED" && nextStatus !== "CANCELLED") {
      throw new Error(`Invalid order state transition: OPEN → ${nextStatus}`);
    }

    order.status = nextStatus;
  }

  /**
   * Walks OPEN limit orders and fills those triggered by marketPrice.
   * Concurrent calls are ignored while a match is in progress.
   */
  async match(marketPrice: number, options: MatchOptions = {}): Promise<MatchResult> {
    if (this.isMatching) {
      return {
        filledTrades: [],
        remainingOrders: this.getOpenOrders(),
      };
    }

    this.isMatching = true;
    console.log("[ENGINE LOCK ACQUIRED]", { marketPrice });

    try {
      const filledTrades: Trade[] = [];
      const remainingOrders: Order[] = [];

      for (const order of this.limitOrders) {
        if (this.filledOrderIds.has(order.id)) {
          console.log("[ORDER ALREADY FILLED SKIPPED]", { orderId: order.id });
          continue;
        }

        if (order.status !== "OPEN") {
          continue;
        }

        console.log("[ORDER MATCH CHECK]", {
          orderId: order.id,
          side: order.side,
          limitPrice: order.price,
          marketPrice,
        });

        if (!isLimitPriceTriggered(order, marketPrice)) {
          remainingOrders.push(order);
          continue;
        }

        if (options.canFill && !options.canFill(order)) {
          remainingOrders.push(order);
          continue;
        }

        if (order.price == null) {
          remainingOrders.push(order);
          continue;
        }

        // Reserve order id before broker call so concurrent paths cannot double-fill.
        this.filledOrderIds.add(order.id);

        const params = {
          symbol: order.symbol,
          quantity: order.quantity,
          price: order.price,
        };

        try {
          const trade =
            order.side === "BUY"
              ? await this.broker.buy(params)
              : await this.broker.sell(params);

          this.updateOrderState(order, "FILLED");
          filledTrades.push(trade);
          options.onFill?.(trade, order);

          console.log("[ORDER FILLED VIA MATCH]", {
            orderId: order.id,
            side: order.side,
            quantity: order.quantity,
            fillPrice: order.price,
            marketPrice,
            tradeId: trade.id,
          });
        } catch (error) {
          // Release reservation; order stays OPEN for a later match attempt.
          this.filledOrderIds.delete(order.id);
          remainingOrders.push(order);
          console.error("[ORDER FILL FAILED]", { orderId: order.id, error });
        }
      }

      this.limitOrders = remainingOrders.map((order) => ({ ...order, status: "OPEN" as const }));

      return {
        filledTrades,
        remainingOrders: this.getOpenOrders(),
      };
    } finally {
      this.isMatching = false;
      console.log("[ENGINE LOCK RELEASED]", { marketPrice });
    }
  }
}

export function createMatchingEngine(broker: Broker): MatchingEngine {
  return new MatchingEngine(broker);
}
