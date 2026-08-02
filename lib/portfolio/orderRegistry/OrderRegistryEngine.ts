import { DEFAULT_EXECUTION_LIQUIDITY } from "@/lib/portfolio/execution/ExecutionLiquidity";
import {
  createOrderId,
  hydrateOrderEntity,
  isOpenOrderStatus,
  type OrderEntity,
  type OrderStatus,
  type RegisterOrderInput,
} from "@/lib/portfolio/orderRegistry/OrderEntity";
import {
  loadOrders,
  saveOrders,
} from "@/lib/portfolio/orderRegistry/orderRegistryStorage";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"],
  PARTIALLY_FILLED: ["FILLED", "CANCELLED", "REJECTED"],
  FILLED: [],
  CANCELLED: [],
  REJECTED: [],
};

/**
 * Persistent order registry — independent from PortfolioEngine.
 * Registers PENDING orders (LIMIT, STOP_*, TAKE_PROFIT_*); never deletes rows.
 * TP/SL are OrderEntity rows linked via positionId — no separate motor.
 */
export class OrderRegistryEngine {
  async list(walletId: string): Promise<OrderEntity[]> {
    const orders = await loadOrders(walletId);
    return orders.map(hydrateOrderEntity).sort((a, b) => b.createdAt - a.createdAt);
  }

  async listOpen(walletId: string): Promise<OrderEntity[]> {
    const orders = await this.list(walletId);
    return orders.filter((order) => isOpenOrderStatus(order.status));
  }

  async listOpenForPosition(
    walletId: string,
    positionId: string,
  ): Promise<OrderEntity[]> {
    const open = await this.listOpen(walletId);
    return open.filter((order) => order.positionId === positionId);
  }

  async getById(walletId: string, orderId: string): Promise<OrderEntity | null> {
    const orders = await loadOrders(walletId);
    return orders.find((order) => order.id === orderId) ?? null;
  }

  /**
   * Registers a new order as PENDING.
   * Does not open a position or write to the ledger.
   */
  async register(input: RegisterOrderInput): Promise<OrderEntity> {
    if (input.triggerPrice <= 0 || input.quantity <= 0 || input.margin < 0) {
      throw new Error("OrderRegistryEngine.register: invalid order parameters");
    }

    const now = Date.now();
    const order: OrderEntity = {
      id: createOrderId(),
      walletId: input.walletId,
      symbol: input.symbol,
      side: input.side,
      direction: input.direction,
      orderType: input.orderType,
      marginMode: input.marginMode,
      leverage: input.leverage,
      triggerPrice: input.triggerPrice,
      quantity: input.quantity,
      margin: input.margin,
      createdAt: now,
      updatedAt: now,
      status: "PENDING",
      positionId: input.positionId ?? null,
      ocoGroupId: input.ocoGroupId ?? null,
      limitPrice: input.limitPrice ?? null,
      reduceOnly: input.reduceOnly ?? false,
      postOnly: input.postOnly ?? false,
      executionLiquidity: input.executionLiquidity ?? DEFAULT_EXECUTION_LIQUIDITY,
      filledAt: null,
      rejectedReason: null,
    };

    const orders = await loadOrders(input.walletId);
    orders.push(order);
    await saveOrders(input.walletId, orders);

    console.log("[ORDER REGISTERED]", {
      orderId: order.id,
      walletId: order.walletId,
      orderType: order.orderType,
      side: order.side,
      triggerPrice: order.triggerPrice,
      positionId: order.positionId,
      status: order.status,
    });

    return order;
  }

  async attachOcoGroupId(
    walletId: string,
    orderId: string,
    ocoGroupId: string,
  ): Promise<OrderEntity> {
    const orders = await loadOrders(walletId);
    const index = orders.findIndex((order) => order.id === orderId);
    if (index < 0) {
      throw new Error(`OrderRegistryEngine: order not found: ${orderId}`);
    }
    const updated: OrderEntity = {
      ...orders[index]!,
      ocoGroupId,
      updatedAt: Date.now(),
    };
    orders[index] = updated;
    await saveOrders(walletId, orders);
    return updated;
  }

  /**
   * Cancels an open order. Never deletes — status becomes CANCELLED.
   */
  async cancel(walletId: string, orderId: string): Promise<OrderEntity> {
    return this.transition(walletId, orderId, "CANCELLED");
  }

  /**
   * Cancels all open orders linked to a position (TP/SL siblings).
   * Never deletes — status becomes CANCELLED.
   */
  async cancelOpenForPosition(
    walletId: string,
    positionId: string,
    options?: { exceptOrderId?: string },
  ): Promise<OrderEntity[]> {
    const open = await this.listOpenForPosition(walletId, positionId);
    const cancelled: OrderEntity[] = [];
    for (const order of open) {
      if (options?.exceptOrderId && order.id === options.exceptOrderId) {
        continue;
      }
      cancelled.push(await this.cancel(walletId, order.id));
    }
    return cancelled;
  }

  async markFilled(walletId: string, orderId: string): Promise<OrderEntity> {
    return this.transition(walletId, orderId, "FILLED", { filledAt: Date.now() });
  }

  async markRejected(
    walletId: string,
    orderId: string,
    reason: string,
  ): Promise<OrderEntity> {
    return this.transition(walletId, orderId, "REJECTED", { rejectedReason: reason });
  }

  private async transition(
    walletId: string,
    orderId: string,
    nextStatus: OrderStatus,
    patch: Partial<OrderEntity> = {},
  ): Promise<OrderEntity> {
    const orders = await loadOrders(walletId);
    const index = orders.findIndex((order) => order.id === orderId);
    if (index < 0) {
      throw new Error(`OrderRegistryEngine: order not found: ${orderId}`);
    }

    const current = orders[index]!;
    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        `OrderRegistryEngine: invalid transition ${current.status} → ${nextStatus}`,
      );
    }

    const updated: OrderEntity = {
      ...current,
      ...patch,
      status: nextStatus,
      updatedAt: Date.now(),
    };
    orders[index] = updated;
    await saveOrders(walletId, orders);

    console.log("[ORDER STATUS]", {
      orderId,
      from: current.status,
      to: nextStatus,
    });

    return updated;
  }
}

export const orderRegistryEngine = new OrderRegistryEngine();
