import type { Broker } from "@/lib/portfolio/brokers/Broker";
import { PaperBroker } from "@/lib/portfolio/brokers/PaperBroker";
import { runWithinLedgerCommit } from "@/lib/cartera/ledger/ledgerCommitContext";
import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  MAX_LEVERAGE,
  resolvePositionMarginMode,
  resolveWalletCash,
} from "@/lib/portfolio/futures/futuresAccounting";
import { hydrateTradeLedger } from "@/lib/portfolio/fees/hydrateTradeFees";
import { createZeroTradeFees } from "@/lib/portfolio/fees/FeeModel";
import { resolveMarketExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidityResolver";
import { resolveWalletBalance } from "@/lib/portfolio/fees/resolveWalletBalance";
import { computeAvailableBalance, computeWalletState } from "@/lib/portfolio/futures/MarginModel";
import {
  createMatchingEngine,
  type MatchingEngine,
} from "@/lib/portfolio/matching/MatchingEngine";
import {
  createOrderEngine,
  type Order,
  type OrderEngine,
} from "@/lib/portfolio/orders/OrderEngine";
import {
  accumulatePositionFromTrades,
  buildPosition,
} from "@/lib/portfolio/positionEngine";
import {
  DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  type PerpAccountPositionMode,
} from "@/lib/portfolio/hedge/PerpAccountPositionMode";
import {
  buildHedgePositions,
  findHedgeLegPosition,
} from "@/lib/portfolio/hedge/hedgePositionEngine";
import { inferPositionSideFromExecution } from "@/lib/portfolio/hedge/resolvePositionSide";
import { aggregateOpenPositionMetrics } from "@/lib/portfolio/position/positionEngineRouter";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import {
  attachExecutionFees,
  sortTradesChronologically,
  validateBrokerOrderParams,
} from "@/lib/portfolio/tradeEngine";
import type {
  MarginMode,
  Portfolio,
  PortfolioEngineState,
  PortfolioPersistedState,
  Position,
  PositionMode,
  Trade,
  TradePositionMode,
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

export class RiskLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiskLimitError";
  }
}

export type PortfolioEngineOptions = {
  positionMode?: PositionMode;
  /** ONE_WAY (default) = net position; HEDGE = independent LONG/SHORT legs. */
  accountPositionMode?: PerpAccountPositionMode;
  leverage?: number;
  marginMode?: MarginMode;
};

export type PortfolioEngineRestoreInput = {
  initialCashBalance: number;
  /** Mutable PERP cash; defaults to initialCashBalance when omitted. */
  walletCash?: number;
  trades: Trade[];
  openLimitOrders?: Order[];
  leverage?: number;
  positionMode?: PositionMode;
  accountPositionMode?: PerpAccountPositionMode;
  marginMode?: MarginMode;
  marketPrice?: number;
};

export type PortfolioMutationReason =
  | "trade_executed"
  | "order_filled"
  | "liquidation"
  | string;

export type PortfolioMutationListener = (
  reason: PortfolioMutationReason,
  state: PortfolioEngineState,
) => void;

function buildPortfolioSummary(
  walletCash: number,
  genesisDeposit: number,
  trades: ReturnType<typeof sortTradesChronologically>,
  marketPrice: number,
  leverage: number,
  marginMode: MarginMode,
  financialEvents: import("@/lib/portfolio/financial/types").FinancialEvent[] = [],
  accountPositionMode: PerpAccountPositionMode = DEFAULT_PERP_ACCOUNT_POSITION_MODE,
): Portfolio {
  const walletBalance = resolveWalletBalance(walletCash, trades, financialEvents);
  const defaults = { leverage, marginMode, walletBalance };
  const metrics = aggregateOpenPositionMetrics(
    trades,
    marketPrice,
    accountPositionMode,
    defaults,
  );
  const { realizedPnL, unrealizedPnL, marginUsed, maintenanceMarginTotal } = metrics;

  const wallet = computeWalletState({
    walletBalance,
    marginUsed,
    unrealizedPnL,
    maintenanceMarginTotal,
    marginMode,
  });

  const totalReturnPercentRaw =
    genesisDeposit > 0
      ? Number((((wallet.equity - genesisDeposit) / genesisDeposit) * 100).toFixed(4))
      : 0;
  const totalReturnPercent = totalReturnPercentRaw === 0 ? 0 : totalReturnPercentRaw;

  return {
    cashBalance: wallet.availableBalance,
    walletBalance: wallet.walletBalance,
    equity: wallet.equity,
    realizedPnL,
    unrealizedPnL: wallet.unrealizedPnL,
    totalReturnPercent,
    marginUsed: wallet.marginUsed,
    leverage,
    marginMode,
    marginRatio: wallet.accountMarginRatio,
  };
}

export function deriveEngineState(
  persisted: PortfolioPersistedState,
  marketPrice: number,
  leverage: number = 1,
  marginMode: MarginMode = "CROSS",
  accountPositionMode: PerpAccountPositionMode = DEFAULT_PERP_ACCOUNT_POSITION_MODE,
): PortfolioEngineState {
  const trades = hydrateTradeLedger(sortTradesChronologically(persisted.trades));
  const financialEvents = persisted.financialEvents ?? [];
  const effectiveMarginMode = resolvePositionMarginMode(trades, marginMode);
  const walletCash = resolveWalletCash(persisted);
  const walletBalance = resolveWalletBalance(walletCash, trades, financialEvents);
  const defaults = { leverage, marginMode: effectiveMarginMode, walletBalance };
  const portfolio = buildPortfolioSummary(
    walletCash,
    persisted.initialCashBalance,
    trades,
    marketPrice,
    leverage,
    effectiveMarginMode,
    financialEvents,
    accountPositionMode,
  );
  const positions = aggregateOpenPositionMetrics(
    trades,
    marketPrice,
    accountPositionMode,
    defaults,
  ).positions;

  return {
    portfolio,
    positions,
    trades,
    financialEvents,
    initialCashBalance: persisted.initialCashBalance,
    walletCash,
  };
}

function resolveTradePositionMode(
  side: Trade["side"],
  quantityBefore: number,
  quantityAfter: number,
): TradePositionMode {
  if (quantityAfter < 0) return "SHORT";
  if (quantityAfter > 0) return "LONG";
  return side === "SELL" ? "SHORT" : "LONG";
}

export class PortfolioEngine {
  private readonly matchingEngine: MatchingEngine;
  private readonly orderEngine: OrderEngine;
  private positionMode: PositionMode;
  private accountPositionMode: PerpAccountPositionMode;
  private leverage: number;
  private marginMode: MarginMode;
  private lastMarketPrice: number | null = null;
  private riskGuardsEnabled = true;
  private liquidating = false;
  private mutationReasonOverride: PortfolioMutationReason | null = null;
  private readonly mutationListeners = new Set<PortfolioMutationListener>();

  constructor(
    private readonly broker: Broker,
    private readonly storage: PortfolioStorage,
    options: PortfolioEngineOptions = {},
  ) {
    this.positionMode = options.positionMode ?? "LONG_ONLY";
    this.accountPositionMode =
      options.accountPositionMode ?? DEFAULT_PERP_ACCOUNT_POSITION_MODE;
    this.leverage = options.leverage ?? 1;
    this.marginMode = options.marginMode ?? "CROSS";
    this.assertLeverageAllowed(this.leverage);
    this.matchingEngine = createMatchingEngine(broker);
    this.orderEngine = createOrderEngine(broker, this.matchingEngine);
  }

  addMutationListener(listener: PortfolioMutationListener): () => void {
    this.mutationListeners.add(listener);
    return () => {
      this.mutationListeners.delete(listener);
    };
  }

  getPositionMode(): PositionMode {
    return this.positionMode;
  }

  getAccountPositionMode(): PerpAccountPositionMode {
    return this.accountPositionMode;
  }

  setAccountPositionMode(mode: PerpAccountPositionMode): void {
    this.accountPositionMode = mode;
  }

  getLeverage(): number {
    return this.leverage;
  }

  getMarginMode(): MarginMode {
    return this.marginMode;
  }

  getLastMarketPrice(): number | null {
    return this.lastMarketPrice;
  }

  setPositionMode(mode: PositionMode): void {
    this.positionMode = mode;
  }

  setLeverage(leverage: number): void {
    this.assertLeverageAllowed(leverage);
    this.leverage = leverage;
  }

  setMarginMode(mode: MarginMode): void {
    this.marginMode = mode;
  }

  async getState(marketPrice: number): Promise<PortfolioEngineState> {
    this.lastMarketPrice = marketPrice;
    const persisted = await this.storage.load();
    await this.syncBrokerTrades(persisted.trades);
    return deriveEngineState(
      persisted,
      marketPrice,
      this.leverage,
      this.marginMode,
      this.accountPositionMode,
    );
  }

  /**
   * Open positions at the given (or last known) market price.
   * Used by RiskScheduler — independent from UI.
   */
  async getOpenPositions(marketPrice?: number): Promise<Position[]> {
    const price = marketPrice ?? this.lastMarketPrice;
    if (price == null) {
      return [];
    }

    const state = await this.getState(price);
    return state.positions.filter((position) => position.quantity !== 0);
  }

  /** UI/runtime alias for open positions. */
  async getPositions(marketPrice?: number): Promise<Position[]> {
    return this.getOpenPositions(marketPrice);
  }

  /**
   * Places a LIMIT order on the matching book (no immediate fill).
   * Thin public binding — does not alter MatchingEngine/ExecutionEngine internals.
   */
  async placeLimitOrder(
    side: Trade["side"],
    quantity: number,
    price: number,
  ): Promise<Order> {
    validateBrokerOrderParams({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });

    if (this.positionMode === "LONG_ONLY" && side === "SELL") {
      const marketPrice = this.lastMarketPrice ?? price;
      const openPosition = buildPosition(
        (await this.storage.load()).trades,
        marketPrice,
      );
      const openQty = openPosition?.quantity ?? 0;
      if (openQty <= 0 || openQty < quantity) {
        throw new InsufficientPositionError(quantity, Math.max(openQty, 0));
      }
    }

    const result = await this.orderEngine.createLimitOrder({
      side,
      quantity,
      price,
    });

    const marketPrice = this.lastMarketPrice ?? price;
    if (marketPrice > 0) {
      const state = await this.getState(marketPrice);
      this.emitMutation("limit_placed", state);
    }

    return result.order;
  }

  /** Snapshot of OPEN limit orders on the in-memory book (for hydration). */
  snapshotLimitOrders(): Order[] {
    return this.matchingEngine.getOpenOrders();
  }

  /** Reattach OPEN limit orders after restart (uses MatchingEngine.addOrder only). */
  reattachLimitOrders(orders: Order[]): void {
    for (const order of orders) {
      if (order.type !== "LIMIT" || order.status !== "OPEN") {
        continue;
      }
      try {
        this.matchingEngine.addOrder({ ...order, status: "OPEN" });
      } catch (error) {
        console.warn("[LIMIT ORDER REATTACH SKIPPED]", {
          orderId: order.id,
          error,
        });
      }
    }
  }

  /**
   * Force-closes an open position at marketPrice (used by LiquidationEngine).
   * Bypasses risk guards and position-mode restrictions for the closing trade only.
   */
  async forceClosePosition(symbol: string, marketPrice: number): Promise<void> {
    this.lastMarketPrice = marketPrice;
    const state = await this.getState(marketPrice);
    const openLegs = state.positions.filter(
      (entry) => entry.symbol === symbol && entry.quantity !== 0,
    );
    if (openLegs.length === 0) {
      return;
    }

    const previousMode = this.positionMode;
    const previousRisk = this.riskGuardsEnabled;
    if (this.accountPositionMode !== "HEDGE") {
      this.positionMode = "LONG_SHORT";
    }
    this.riskGuardsEnabled = false;
    this.liquidating = true;
    this.mutationReasonOverride = "liquidation";

    try {
      for (const position of openLegs) {
        const quantity = Math.abs(position.quantity);
        const displaySide =
          position.side ?? (position.quantity > 0 ? "LONG" : "SHORT");
        const closeMeta = this.accountPositionMode === "HEDGE" ? { reduceOnly: true as const } : undefined;

        if (displaySide === "LONG") {
          await this.sell(quantity, marketPrice, marketPrice, closeMeta);
        } else {
          await this.buy(quantity, marketPrice, marketPrice, closeMeta);
        }
      }
    } finally {
      this.positionMode = previousMode;
      this.riskGuardsEnabled = previousRisk;
      this.liquidating = false;
      this.mutationReasonOverride = null;
    }
  }

  /**
   * Replaces ledger trades and runtime config from a snapshot.
   * Uses ledger commit boundary for storage write (no ledger logic changes).
   */
  async restoreState(input: PortfolioEngineRestoreInput): Promise<PortfolioEngineState> {
    for (const order of this.matchingEngine.getOpenOrders()) {
      this.matchingEngine.cancelOrder(order.id);
    }

    const walletCash = input.walletCash ?? input.initialCashBalance;
    await runWithinLedgerCommit(async () => {
      await this.storage.save({
        initialCashBalance: input.initialCashBalance,
        walletCash,
        trades: input.trades.map((trade) => ({ ...trade })),
        orders: [],
        fills: [],
      });
    });

    await this.syncBrokerTrades(input.trades);

    if (input.leverage != null) {
      this.setLeverage(input.leverage);
    }
    if (input.positionMode != null) {
      this.setPositionMode(input.positionMode);
    }
    if (input.accountPositionMode != null) {
      this.setAccountPositionMode(input.accountPositionMode);
    }
    if (input.marginMode != null) {
      this.setMarginMode(input.marginMode);
    }

    this.reattachLimitOrders(input.openLimitOrders ?? []);

    const price =
      input.marketPrice ??
      this.lastMarketPrice ??
      input.trades[input.trades.length - 1]?.price ??
      0;

    if (price > 0) {
      this.lastMarketPrice = price;
    }

    return deriveEngineState(
      {
        initialCashBalance: input.initialCashBalance,
        walletCash,
        trades: input.trades,
        financialEvents: input.financialEvents ?? [],
        orders: [],
        fills: [],
      },
      this.lastMarketPrice ?? price,
      this.leverage,
      this.marginMode,
      this.accountPositionMode,
    );
  }

  private emitMutation(reason: PortfolioMutationReason, state: PortfolioEngineState): void {
    for (const listener of this.mutationListeners) {
      try {
        listener(reason, state);
      } catch (error) {
        console.warn("[ENGINE MUTATION LISTENER FAILED]", error);
      }
    }
  }

  async buy(
    quantity: number,
    price: number,
    marketPrice: number,
    executionMeta?: {
      reduceOnly?: boolean;
      postOnly?: boolean;
      executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
      orderType?: "MARKET" | "LIMIT";
      triggerReason?: import("@/lib/portfolio/oco/OcoGroup").TradeTriggerReason;
    },
  ): Promise<PortfolioEngineState> {
    validateBrokerOrderParams({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });
    this.lastMarketPrice = marketPrice;

    const tx = await beginLedgerTransaction(this.storage);
    try {
      const persisted = tx.base;
      const workingTrades = tx.workingTrades();

      this.assertMarginForIntent(workingTrades, resolveWalletCash(persisted), persisted.financialEvents, {
        side: "BUY",
        quantity,
        price,
        marketPrice,
      });

      this.assertRiskForIntent(workingTrades, resolveWalletCash(persisted), {
        side: "BUY",
        quantity,
        price,
        marketPrice,
      });

      const { trade } = await this.orderEngine.createMarketOrder({
        side: "BUY",
        quantity,
        price,
      });
      if (trade != null) {
        tx.appendTrade(
          this.enrichTrade(trade, workingTrades, "BUY", quantity, price, executionMeta),
        );
      }
      const nextState = await tx.commit();
      const derived = deriveEngineState(
        nextState,
        marketPrice,
        this.leverage,
        this.marginMode,
        this.accountPositionMode,
      );
      this.emitMutation(this.mutationReasonOverride ?? "trade_executed", derived);
      return derived;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  async sell(
    quantity: number,
    price: number,
    marketPrice: number,
    executionMeta?: {
      reduceOnly?: boolean;
      postOnly?: boolean;
      executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
      orderType?: "MARKET" | "LIMIT";
      triggerReason?: import("@/lib/portfolio/oco/OcoGroup").TradeTriggerReason;
    },
  ): Promise<PortfolioEngineState> {
    validateBrokerOrderParams({ symbol: PORTFOLIO_V1_SYMBOL, quantity, price });
    this.lastMarketPrice = marketPrice;

    const tx = await beginLedgerTransaction(this.storage);
    try {
      const persisted = tx.base;
      const workingTrades = tx.workingTrades();
      const defaults = { leverage: this.leverage, marginMode: this.marginMode };
      const openPosition = buildPosition(workingTrades, price, PORTFOLIO_V1_SYMBOL, defaults);
      const openQty = openPosition?.quantity ?? 0;

      if (
        this.accountPositionMode !== "HEDGE" &&
        this.positionMode === "LONG_ONLY"
      ) {
        if (openQty <= 0 || openQty < quantity) {
          throw new InsufficientPositionError(quantity, Math.max(openQty, 0));
        }
      }

      this.assertMarginForIntent(workingTrades, resolveWalletCash(persisted), persisted.financialEvents, {
        side: "SELL",
        quantity,
        price,
        marketPrice,
      });

      this.assertRiskForIntent(workingTrades, resolveWalletCash(persisted), {
        side: "SELL",
        quantity,
        price,
        marketPrice,
      });

      const { trade } = await this.orderEngine.createMarketOrder({
        side: "SELL",
        quantity,
        price,
      });
      if (trade != null) {
        tx.appendTrade(
          this.enrichTrade(trade, workingTrades, "SELL", quantity, price, executionMeta),
        );
      }
      const nextState = await tx.commit();
      const derived = deriveEngineState(
        nextState,
        marketPrice,
        this.leverage,
        this.marginMode,
        this.accountPositionMode,
      );
      this.emitMutation(this.mutationReasonOverride ?? "trade_executed", derived);
      return derived;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  /**
   * Applies market price for PnL / limit matching only.
   * Liquidation is owned exclusively by RiskScheduler.
   * Never throws — matching failures are logged and the last known state is returned.
   */
  async onPriceUpdate(marketPrice: number): Promise<PortfolioEngineState> {
    console.log("[PRICE UPDATE TRIGGER MATCH]", { marketPrice });
    this.lastMarketPrice = marketPrice;

    let persisted: PortfolioPersistedState;
    try {
      persisted = await this.storage.load();
      await this.syncBrokerTrades(persisted.trades);
    } catch (error) {
      console.error("[PRICE UPDATE MATCH FAILED]", error);
      try {
        const fallback = await this.storage.load();
        return deriveEngineState(fallback, marketPrice, this.leverage, this.marginMode, this.accountPositionMode);
      } catch {
        return deriveEngineState(
          { initialCashBalance: 0, walletCash: 0, trades: [], orders: [], fills: [] },
          marketPrice,
          this.leverage,
          this.marginMode,
          this.accountPositionMode,
        );
      }
    }

    try {
      let workingTrades: Trade[] = [...persisted.trades];
      const defaults = { leverage: this.leverage, marginMode: this.marginMode };

      const canFill = (order: Order): boolean => {
        if (order.price == null) return false;

        if (this.positionMode === "LONG_ONLY" && order.side === "SELL") {
          const openPosition = buildPosition(
            workingTrades,
            marketPrice,
            PORTFOLIO_V1_SYMBOL,
            defaults,
          );
          const openQty = openPosition?.quantity ?? 0;
          if (openQty <= 0 || openQty < order.quantity) return false;
        }

        try {
          this.assertMarginForIntent(workingTrades, resolveWalletCash(persisted), persisted.financialEvents, {
            side: order.side,
            quantity: order.quantity,
            price: order.price,
            marketPrice,
          });
          this.assertRiskForIntent(workingTrades, resolveWalletCash(persisted), {
            side: order.side,
            quantity: order.quantity,
            price: order.price,
            marketPrice,
          });
          return true;
        } catch {
          return false;
        }
      };

      const { filledTrades } = await this.matchingEngine.match(marketPrice, {
        canFill,
        onFill: (trade) => {
          workingTrades = [...workingTrades, trade];
        },
      });

      if (filledTrades.length === 0) {
        const latest = await this.storage.load();
        return deriveEngineState(latest, marketPrice, this.leverage, this.marginMode, this.accountPositionMode);
      }

      const tx = await beginLedgerTransaction(this.storage);
      try {
        let ledgerWorking = tx.workingTrades();
        for (const trade of filledTrades) {
          const enriched = this.enrichTrade(
            trade,
            ledgerWorking,
            trade.side,
            trade.quantity,
            trade.price,
          );
          tx.appendTrade(enriched);
          ledgerWorking = [...ledgerWorking, enriched];
        }
        const nextState = await tx.commit();
        const derived = deriveEngineState(
          nextState,
          marketPrice,
          this.leverage,
          this.marginMode,
          this.accountPositionMode,
        );
        this.emitMutation("order_filled", derived);
        return derived;
      } catch (error) {
        tx.rollback();
        throw error;
      }
    } catch (error) {
      console.error("[PRICE UPDATE MATCH FAILED]", error);
      return deriveEngineState(persisted, marketPrice, this.leverage, this.marginMode, this.accountPositionMode);
    }
  }

  private enrichTrade(
    trade: Trade,
    workingTrades: Trade[],
    side: Trade["side"],
    quantity: number,
    price: number,
    executionMeta?: {
      reduceOnly?: boolean;
      postOnly?: boolean;
      executionLiquidity?: import("@/lib/portfolio/execution/ExecutionLiquidity").ExecutionLiquidity;
      orderType?: "MARKET" | "LIMIT";
      triggerReason?: import("@/lib/portfolio/oco/OcoGroup").TradeTriggerReason;
    },
  ): Trade {
    const defaults = { leverage: this.leverage, marginMode: this.marginMode };
    const positionSide = inferPositionSideFromExecution({
      side,
      reduceOnly: executionMeta?.reduceOnly,
    });

    let quantityBefore = 0;
    let quantityAfter = 0;
    let positionMode: TradePositionMode = positionSide;

    if (this.accountPositionMode === "HEDGE") {
      const legs = buildHedgePositions(workingTrades, price, PORTFOLIO_V1_SYMBOL, defaults);
      const leg = findHedgeLegPosition(legs, PORTFOLIO_V1_SYMBOL, positionSide);
      quantityBefore = leg?.quantity ?? 0;

      const opens =
        (positionSide === "LONG" && side === "BUY") || (positionSide === "SHORT" && side === "SELL");
      quantityAfter = opens
        ? quantityBefore + quantity
        : Math.max(0, quantityBefore - quantity);
    } else {
      const before = buildPosition(workingTrades, price, PORTFOLIO_V1_SYMBOL, defaults);
      const simulated: Trade = { ...trade, side, quantity, price };
      const after = buildPosition(
        [...workingTrades, simulated],
        price,
        PORTFOLIO_V1_SYMBOL,
        defaults,
      );
      quantityBefore = before?.quantity ?? 0;
      quantityAfter = after?.quantity ?? 0;
      positionMode = resolveTradePositionMode(side, quantityBefore, quantityAfter);
    }

    const executionLiquidity =
      executionMeta?.executionLiquidity ?? resolveMarketExecutionLiquidity();

    const enriched: Trade = {
      ...trade,
      leverage: this.leverage,
      positionMode,
      positionSide: this.accountPositionMode === "HEDGE" ? positionSide : undefined,
      marginMode: this.marginMode,
      ...(this.liquidating ? { liquidation: true } : {}),
      ...(executionMeta?.reduceOnly ? { reduceOnly: true } : {}),
      ...(executionMeta?.postOnly ? { postOnly: true } : {}),
      executionLiquidity,
      ...(executionMeta?.triggerReason ? { triggerReason: executionMeta.triggerReason } : {}),
    };

    return attachExecutionFees(enriched, {
      quantityBefore,
      quantityAfter,
      executionLiquidity,
    });
  }

  private assertLeverageAllowed(leverage: number): void {
    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new RiskLimitError("Leverage must be a positive number");
    }
    if (leverage > MAX_LEVERAGE) {
      throw new RiskLimitError(`Leverage ${leverage} exceeds maximum of ${MAX_LEVERAGE}`);
    }
  }

  /**
   * Futures margin check: only additional initial margin must fit in available balance.
   * Reducing / closing a position never requires extra margin.
   */
  private assertMarginForIntent(
    workingTrades: Trade[],
    walletCash: number,
    financialEvents: import("@/lib/portfolio/financial/types").FinancialEvent[] | undefined,
    intent: {
      side: Trade["side"];
      quantity: number;
      price: number;
      marketPrice: number;
    },
  ): void {
    if (!this.riskGuardsEnabled) {
      return;
    }

    const defaults = { leverage: this.leverage, marginMode: this.marginMode };
    const mark = intent.marketPrice > 0 ? intent.marketPrice : intent.price;
    const walletBalance = resolveWalletBalance(walletCash, workingTrades, financialEvents);
    const buildDefaults = { ...defaults, walletBalance };
    const before = buildPosition(workingTrades, mark, PORTFOLIO_V1_SYMBOL, buildDefaults);

    const provisional: Trade = {
      id: `margin_${intent.side}_${intent.quantity}_${intent.price}`,
      symbol: PORTFOLIO_V1_SYMBOL,
      side: intent.side,
      quantity: intent.quantity,
      price: intent.price,
      timestamp: Date.now(),
      source: "PAPER",
      leverage: this.leverage,
      marginMode: this.marginMode,
      fees: createZeroTradeFees(),
    };

    const after = buildPosition(
      [...workingTrades, provisional],
      mark,
      PORTFOLIO_V1_SYMBOL,
      buildDefaults,
    );

    const marginBefore = before && before.quantity !== 0 ? before.entryMargin : 0;
    const marginAfter = after && after.quantity !== 0 ? after.entryMargin : 0;
    const additionalMargin = Math.max(0, marginAfter - marginBefore);
    const provisionalFees = attachExecutionFees(provisional, {
      quantityBefore: before?.quantity ?? 0,
      quantityAfter: after?.quantity ?? 0,
      executionLiquidity: resolveMarketExecutionLiquidity(),
    }).fees.totalFee;

    if (additionalMargin <= 0 && provisionalFees <= 0) {
      return;
    }

    const unrealizedPnL = before && before.quantity !== 0 ? before.unrealizedPnL : 0;
    const effectiveMarginMode = resolvePositionMarginMode(workingTrades, this.marginMode);
    const available = computeAvailableBalance({
      walletBalance,
      marginUsed: marginBefore,
      unrealizedPnL,
      marginMode: effectiveMarginMode,
    });

    const required = additionalMargin + provisionalFees;
    if (required > available) {
      throw new InsufficientCashError(required, available);
    }
  }

  private assertRiskForIntent(
    _workingTrades: Trade[],
    _walletCash: number,
    _intent: {
      side: Trade["side"];
      quantity: number;
      price: number;
      marketPrice: number;
    },
  ): void {
    if (!this.riskGuardsEnabled) {
      return;
    }

    // Futures risk is margin-based (assertMarginForIntent) + liquidation.
    this.assertLeverageAllowed(this.leverage);
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
  options: PortfolioEngineOptions = {},
): PortfolioEngine {
  return new PortfolioEngine(broker, storage, options);
}
