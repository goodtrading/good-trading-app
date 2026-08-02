import {
  cloneBalances,
  findBalance,
  getOrCreateBalance,
  pruneZeroBalances,
  recomputeTotals,
} from "@/lib/portfolio/spot/balanceHelpers";
import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";
import {
  SpotInsufficientBalanceError,
  SpotValidationError,
} from "@/lib/portfolio/spot/SpotExecutionService";
import type {
  SpotLedgerState,
  SpotOrder,
  SpotOrderPurpose,
  SpotOrderType,
  SpotTrade,
} from "@/lib/portfolio/spot/types";

export type SpotLimitOrderInput = {
  baseAsset: string;
  quoteAsset?: string;
  /** Base quantity. */
  quantity: number;
  /** Limit price (quote per base). */
  limitPrice: number;
  purpose?: SpotOrderPurpose;
  positionAsset?: string | null;
};

export type SpotOrderMutationResult = {
  order: SpotOrder;
  state: SpotLedgerState;
  trade?: SpotTrade;
};

const DEFAULT_QUOTE = "USDT";

/**
 * Spot LIMIT order registry — locks balances on place, unlocks on cancel,
 * settles via SpotLedger on fill. Never uses PERP OrderRegistryEngine.
 */
export class SpotOrderRegistry {
  async list(walletId: string): Promise<SpotOrder[]> {
    const ledger = await this.ledgerFor(walletId);
    const state = ledger.getState() ?? (await ledger.load());
    return (state?.orders ?? []).map(normalizeSpotOrder);
  }

  async listOpen(walletId: string): Promise<SpotOrder[]> {
    const orders = await this.list(walletId);
    return orders.filter(
      (order) => order.status === "PENDING" || order.status === "PARTIALLY_FILLED",
    );
  }

  async getById(walletId: string, orderId: string): Promise<SpotOrder | null> {
    const orders = await this.list(walletId);
    return orders.find((o) => o.id === orderId) ?? null;
  }

  /**
   * BUY LIMIT: lock quote (USDT) = quantity × limitPrice from free → locked.
   * total unchanged.
   */
  async registerBuyLimit(
    walletId: string,
    input: SpotLimitOrderInput,
  ): Promise<SpotOrderMutationResult> {
    const { baseAsset, quoteAsset, quantity, limitPrice } = normalize(input);
    assertPositive(quantity, "Quantity");
    assertPositive(limitPrice, "Limit price");

    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);
    const quoteLock = quantity * limitPrice;
    const balances = cloneBalances(state.balances);

    const quoteBal = getOrCreateBalance(balances, quoteAsset);
    if (quoteBal.free < quoteLock) {
      throw new SpotInsufficientBalanceError(
        `Insufficient ${quoteAsset}: need ${quoteLock}, free ${quoteBal.free}`,
      );
    }

    quoteBal.free -= quoteLock;
    quoteBal.locked += quoteLock;
    recomputeTotals(balances);

    const order = createOrder({
      walletId,
      baseAsset,
      quoteAsset,
      side: "BUY",
      orderType: "LIMIT",
      quantity,
      triggerPrice: limitPrice,
      purpose: input.purpose ?? "TRADE",
      positionAsset: input.positionAsset ?? null,
    });

    const orders = [...state.orders, order];
    const next = await ledger.commitMutation({ balances, orders });
    return { order, state: next };
  }

  /**
   * SELL LIMIT: lock base asset quantity from free → locked.
   * total unchanged.
   */
  async registerSellLimit(
    walletId: string,
    input: SpotLimitOrderInput,
  ): Promise<SpotOrderMutationResult> {
    const { baseAsset, quoteAsset, quantity, limitPrice } = normalize(input);
    assertPositive(quantity, "Quantity");
    assertPositive(limitPrice, "Limit price");

    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);
    const balances = cloneBalances(state.balances);

    const baseBal = findBalance(balances, baseAsset);
    if (!baseBal || baseBal.free < quantity) {
      throw new SpotInsufficientBalanceError(
        `Insufficient ${baseAsset}: need ${quantity}, free ${baseBal?.free ?? 0}`,
      );
    }

    baseBal.free -= quantity;
    baseBal.locked += quantity;
    recomputeTotals(balances);

    const order = createOrder({
      walletId,
      baseAsset,
      quoteAsset,
      side: "SELL",
      orderType: "LIMIT",
      quantity,
      triggerPrice: limitPrice,
      purpose: input.purpose ?? "TRADE",
      positionAsset: input.positionAsset ?? null,
    });

    const orders = [...state.orders, order];
    const next = await ledger.commitMutation({ balances, orders });
    return { order, state: next };
  }

  /**
   * STOP SELL: conditional exit — does not lock base (trigger sells at market).
   */
  async registerStopSell(
    walletId: string,
    input: SpotLimitOrderInput,
  ): Promise<SpotOrderMutationResult> {
    const { baseAsset, quoteAsset, quantity, limitPrice } = normalize(input);
    assertPositive(quantity, "Quantity");
    assertPositive(limitPrice, "Stop price");

    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);

    const baseBal = findBalance(state.balances, baseAsset);
    if (!baseBal || baseBal.total < quantity) {
      throw new SpotInsufficientBalanceError(
        `Insufficient ${baseAsset}: need ${quantity}, total ${baseBal?.total ?? 0}`,
      );
    }

    const order = createOrder({
      walletId,
      baseAsset,
      quoteAsset,
      side: "SELL",
      orderType: "STOP",
      quantity,
      triggerPrice: limitPrice,
      purpose: input.purpose ?? "STOP_LOSS",
      positionAsset: input.positionAsset ?? baseAsset,
    });

    const orders = [...state.orders, order];
    const next = await ledger.commitMutation({ balances: state.balances, orders });
    return { order, state: next };
  }

  /** Cancel open TP/SL orders linked to a base asset. */
  async cancelTpSlForAsset(walletId: string, baseAsset: string): Promise<void> {
    const asset = baseAsset.trim().toUpperCase();
    const open = await this.listOpen(walletId);
    for (const order of open) {
      if (
        order.positionAsset === asset &&
        (order.purpose === "TAKE_PROFIT" || order.purpose === "STOP_LOSS")
      ) {
        await this.cancel(walletId, order.id);
      }
    }
  }

  /** Cancel all open SELL orders for a base asset (unlocks inventory). */
  async cancelOpenSellsForAsset(walletId: string, baseAsset: string): Promise<void> {
    const asset = baseAsset.trim().toUpperCase();
    const open = await this.listOpen(walletId);
    for (const order of open) {
      if (order.baseAsset === asset && order.side === "SELL") {
        await this.cancel(walletId, order.id);
      }
    }
  }

  /**
   * STOP SELL triggered at market — sells locked base at market price.
   */
  async triggerStopSell(
    walletId: string,
    orderId: string,
    marketPrice: number,
  ): Promise<SpotOrderMutationResult> {
    assertPositive(marketPrice, "Market price");

    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);
    const index = state.orders.findIndex((o) => o.id === orderId);
    if (index < 0) {
      throw new SpotValidationError(`Spot order not found: ${orderId}`);
    }

    const order = state.orders[index]!;
    if (order.orderType !== "STOP" || order.side !== "SELL") {
      throw new SpotValidationError("Only STOP SELL orders can be triggered");
    }
    if (order.status !== "PENDING" && order.status !== "PARTIALLY_FILLED") {
      throw new SpotValidationError(
        `Spot order cannot be triggered in status ${order.status}`,
      );
    }
    if (order.triggerPrice == null) {
      throw new SpotValidationError("STOP order missing trigger price");
    }

    const balances = cloneBalances(state.balances);
    let orders = [...state.orders];

    if (order.positionAsset) {
      cancelSiblingTpSlOrders(orders, balances, order.positionAsset, orderId);
    }

    const baseBal = getOrCreateBalance(balances, order.baseAsset);
    if (baseBal.free < order.quantity - 1e-12) {
      throw new SpotValidationError(
        `Insufficient ${order.baseAsset} for STOP fill`,
      );
    }

    baseBal.free -= order.quantity;
    recomputeTotals(balances);

    const quoteAmount = order.quantity * marketPrice;
    const quoteBal = getOrCreateBalance(balances, order.quoteAsset);
    quoteBal.free += quoteAmount;
    recomputeTotals(balances);

    const trade: SpotTrade = {
      id: createSpotTradeId(),
      domain: "SPOT",
      walletId,
      baseAsset: order.baseAsset,
      quoteAsset: order.quoteAsset,
      side: "SELL",
      quantity: order.quantity,
      price: marketPrice,
      quoteQuantity: quoteAmount,
      timestamp: Date.now(),
    };

    const now = Date.now();
    const filled: SpotOrder = {
      ...order,
      status: "FILLED",
      filledQuantity: order.quantity,
      updatedAt: now,
    };
    const filledIndex = orders.findIndex((o) => o.id === orderId);
    if (filledIndex >= 0) {
      orders[filledIndex] = filled;
    }
    const trades = [...state.trades, trade];

    const next = await ledger.commitMutation({
      balances: pruneZeroBalances(balances),
      orders,
      trades,
    });
    await spotPositionRuntime.applyTrade(walletId, trade);
    return { order: filled, state: next, trade };
  }

  /**
   * Cancel PENDING order: unlock balances, no SpotTrade.
   */
  async cancel(walletId: string, orderId: string): Promise<SpotOrderMutationResult> {
    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);
    const index = state.orders.findIndex((o) => o.id === orderId);
    if (index < 0) {
      throw new SpotValidationError(`Spot order not found: ${orderId}`);
    }

    const order = state.orders[index]!;
    if (order.status !== "PENDING" && order.status !== "PARTIALLY_FILLED") {
      throw new SpotValidationError(
        `Spot order cannot be cancelled in status ${order.status}`,
      );
    }

    const balances = cloneBalances(state.balances);
    unlockForOrder(balances, order);

    const now = Date.now();
    const cancelled: SpotOrder = {
      ...order,
      status: "CANCELLED",
      updatedAt: now,
    };
    const orders = [...state.orders];
    orders[index] = cancelled;

    const next = await ledger.commitMutation({
      balances: pruneZeroBalances(balances),
      orders,
    });
    return { order: cancelled, state: next };
  }

  /**
   * Fill PENDING LIMIT at trigger price.
   * BUY: release locked USDT, credit base.
   * SELL: release locked base, credit USDT.
   */
  async fill(walletId: string, orderId: string): Promise<SpotOrderMutationResult> {
    const ledger = await this.ledgerFor(walletId);
    const state = await requireState(ledger);
    const index = state.orders.findIndex((o) => o.id === orderId);
    if (index < 0) {
      throw new SpotValidationError(`Spot order not found: ${orderId}`);
    }

    const order = state.orders[index]!;
    if (order.status !== "PENDING" && order.status !== "PARTIALLY_FILLED") {
      throw new SpotValidationError(
        `Spot order cannot be filled in status ${order.status}`,
      );
    }
    if (order.orderType !== "LIMIT" || order.triggerPrice == null) {
      throw new SpotValidationError("Only LIMIT orders can be filled by evaluator");
    }

    const balances = cloneBalances(state.balances);
    const fillPrice = order.triggerPrice;
    const quoteAmount = order.quantity * fillPrice;

    if (order.side === "BUY") {
      const quoteBal = getOrCreateBalance(balances, order.quoteAsset);
      if (quoteBal.locked < quoteAmount - 1e-12) {
        throw new SpotValidationError(
          `Locked ${order.quoteAsset} insufficient for fill`,
        );
      }
      quoteBal.locked -= quoteAmount;
      // spent: total decreases
      recomputeTotals(balances);

      const baseBal = getOrCreateBalance(balances, order.baseAsset);
      baseBal.free += order.quantity;
      recomputeTotals(balances);
    } else {
      const baseBal = getOrCreateBalance(balances, order.baseAsset);
      if (baseBal.locked < order.quantity - 1e-12) {
        throw new SpotValidationError(
          `Locked ${order.baseAsset} insufficient for fill`,
        );
      }
      baseBal.locked -= order.quantity;
      recomputeTotals(balances);

      const quoteBal = getOrCreateBalance(balances, order.quoteAsset);
      quoteBal.free += quoteAmount;
      recomputeTotals(balances);
    }

    const trade: SpotTrade = {
      id: createSpotTradeId(),
      domain: "SPOT",
      walletId,
      baseAsset: order.baseAsset,
      quoteAsset: order.quoteAsset,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
      quoteQuantity: quoteAmount,
      timestamp: Date.now(),
    };

    const now = Date.now();
    const filled: SpotOrder = {
      ...order,
      status: "FILLED",
      filledQuantity: order.quantity,
      updatedAt: now,
    };
    let orders = [...state.orders];
    orders[index] = filled;

    if (order.positionAsset && order.purpose !== "TRADE") {
      cancelSiblingTpSlOrders(orders, balances, order.positionAsset, orderId);
    }

    const trades = [...state.trades, trade];

    const next = await ledger.commitMutation({
      balances: pruneZeroBalances(balances),
      orders,
      trades,
    });
    await spotPositionRuntime.applyTrade(walletId, trade);
    return { order: filled, state: next, trade };
  }

  private async ledgerFor(walletId: string): Promise<SpotLedger> {
    return spotLedgerRuntime.start(walletId, { createIfMissing: true });
  }
}

function unlockForOrder(balances: ReturnType<typeof cloneBalances>, order: SpotOrder): void {
  if (order.triggerPrice == null) return;
  if (order.orderType === "STOP") return;

  if (order.side === "BUY") {
    const quoteLock = order.quantity * order.triggerPrice;
    const quoteBal = getOrCreateBalance(balances, order.quoteAsset);
    const unlock = Math.min(quoteBal.locked, quoteLock);
    quoteBal.locked -= unlock;
    quoteBal.free += unlock;
    recomputeTotals(balances);
    return;
  }

  const baseBal = getOrCreateBalance(balances, order.baseAsset);
  const unlock = Math.min(baseBal.locked, order.quantity);
  baseBal.locked -= unlock;
  baseBal.free += unlock;
  recomputeTotals(balances);
}

function cancelSiblingTpSlOrders(
  orders: SpotOrder[],
  balances: ReturnType<typeof cloneBalances>,
  positionAsset: string,
  exceptOrderId: string,
): void {
  const now = Date.now();
  for (let i = 0; i < orders.length; i++) {
    const entry = orders[i]!;
    if (
      entry.id === exceptOrderId ||
      entry.positionAsset !== positionAsset ||
      (entry.purpose !== "TAKE_PROFIT" && entry.purpose !== "STOP_LOSS") ||
      (entry.status !== "PENDING" && entry.status !== "PARTIALLY_FILLED")
    ) {
      continue;
    }
    unlockForOrder(balances, entry);
    orders[i] = { ...entry, status: "CANCELLED", updatedAt: now };
  }
}

function normalizeSpotOrder(order: SpotOrder): SpotOrder {
  return {
    ...order,
    purpose: order.purpose ?? "TRADE",
    positionAsset: order.positionAsset ?? null,
  };
}

function createOrder(args: {
  walletId: string;
  baseAsset: string;
  quoteAsset: string;
  side: "BUY" | "SELL";
  orderType: SpotOrderType;
  quantity: number;
  triggerPrice: number;
  purpose: SpotOrderPurpose;
  positionAsset: string | null;
}): SpotOrder {
  const now = Date.now();
  return {
    id: createSpotOrderId(),
    domain: "SPOT",
    walletId: args.walletId,
    baseAsset: args.baseAsset,
    quoteAsset: args.quoteAsset,
    side: args.side,
    orderType: args.orderType,
    status: "PENDING",
    triggerPrice: args.triggerPrice,
    quantity: args.quantity,
    filledQuantity: 0,
    positionAsset: args.positionAsset,
    purpose: args.purpose,
    createdAt: now,
    updatedAt: now,
  };
}

function normalize(input: SpotLimitOrderInput) {
  return {
    baseAsset: input.baseAsset.trim().toUpperCase(),
    quoteAsset: (input.quoteAsset ?? DEFAULT_QUOTE).trim().toUpperCase(),
    quantity: input.quantity,
    limitPrice: input.limitPrice,
  };
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SpotValidationError(`${label} must be greater than zero`);
  }
}

async function requireState(ledger: SpotLedger) {
  const state = ledger.getState() ?? (await ledger.load());
  if (!state) {
    throw new SpotValidationError(
      `SpotOrderRegistry: no ledger for ${ledger.getWalletId()}`,
    );
  }
  return state;
}

function createSpotOrderId(): string {
  return `spot_ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createSpotTradeId(): string {
  return `spot_trade_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const spotOrderRegistry = new SpotOrderRegistry();
