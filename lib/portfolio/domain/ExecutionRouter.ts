import type { ExecutionRequest } from "@/lib/portfolio/domain/types/execution";
import type { PerpExecutionIntent } from "@/lib/portfolio/domain/types/perp";
import type { SpotExecutionIntent } from "@/lib/portfolio/domain/types/spot";
import type {
  CancelOrderResult,
  CancelTrailingStopResult,
  ClosePositionResult,
  ExecutionCommand,
  FillOrderResult,
  ForceLiquidateResult,
  RegisterTrailingStopResult,
  TriggerTrailingStopResult,
  UpdateTpSlResult,
} from "@/lib/portfolio/domain/types/commands";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  cancelLinkedOrdersIfPositionFlat,
  replacePositionTpSl,
} from "@/lib/portfolio/orderRegistry/syncPositionOrders";
import {
  reduceOnlyQuantityMode,
  resolveReduceOnlyPositionQuantity,
} from "@/lib/portfolio/hedge/resolveReduceOnlyContext";
import { resolvePositionDisplaySide } from "@/lib/portfolio/hedge/resolvePositionSide";
import {
  cancelOcoCounterpartOnFill,
  cancelOcoCounterpartOnManualCancel,
  cancelOcoGroupsForFlatPositionLeg,
  resolveTriggerReasonFromOrder,
} from "@/lib/portfolio/oco/OcoCancellation";
import { buildTrailingStop } from "@/lib/portfolio/trailing/TrailingStopBuilder";
import { trailingStopRuntime } from "@/lib/portfolio/trailing/TrailingStopRuntime";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  SpotExecutionService,
  type SpotExecutionResult,
} from "@/lib/portfolio/spot/SpotExecutionService";
import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotOrderRegistry } from "@/lib/portfolio/spot/orders/SpotOrderRegistry";
import { spotPositionService } from "@/lib/portfolio/spot/SpotPositionService";
import { parseSpotSymbol } from "@/lib/portfolio/spot/spotSymbol";
import type {
  SpotLedgerState,
  SpotOrder,
  SpotTrade,
} from "@/lib/portfolio/spot/types";
import { executeTradeRequest } from "@/lib/portfolio/trade/executeTradeRequest";
import { assertReduceOnlyExecution, clampReduceOnlyQuantity } from "@/lib/portfolio/reduceOnly/ReduceOnlyValidator";
import { resolveMarketExecutionLiquidity } from "@/lib/portfolio/execution/ExecutionLiquidityResolver";
import type {
  TradeExecutionRequest,
  TradeOrderType,
} from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { PortfolioEngineState } from "@/lib/portfolio/types";

/** Thrown for unsupported SPOT features (STOP, TP, margin, short open, etc.). */
export class SpotNotSupportedError extends Error {
  constructor() {
    super("Not supported in SPOT");
    this.name = "SpotNotSupportedError";
  }
}

/** @deprecated Use SpotNotSupportedError — kept for import compatibility. */
export class SpotContractError extends SpotNotSupportedError {}

export type SpotDispatchResult =
  | { domain: "SPOT"; trade: SpotTrade; state: SpotLedgerState }
  | {
      domain: "SPOT";
      order: SpotOrder;
      state: SpotLedgerState;
      pending: true;
    }
  | {
      domain: "SPOT";
      order: SpotOrder;
      state: SpotLedgerState;
      cancelled: true;
    };

export type ExecutionResult =
  | PortfolioEngineState
  | { orderId: string; pending: true }
  | SpotDispatchResult;

/**
 * Sole write entrypoint for trading (Phase 7).
 *
 * SPOT → SpotExecutionService / SpotOrderRegistry / SpotLedger
 *        (MARKET buy/sell, LIMIT buy/sell, cancel)
 * PERP → existing futures stack (unchanged).
 */
export class ExecutionRouter {
  async execute(
    engine: PortfolioEngine | null,
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    if (request.domain === "SPOT") {
      return this.executeSpotTrade(request.intent);
    }

    if (!engine) {
      throw new Error("Motor de trading no disponible");
    }

    return this.executePerpTrade(
      engine,
      intentToLegacyRequest("PERP", request.intent),
    );
  }

  async dispatch(
    engine: PortfolioEngine | null,
    command: ExecutionCommand,
  ): Promise<unknown> {
    if (command.type === "EXECUTE_TRADE") {
      if (command.request.domain === "SPOT") {
        return this.executeSpotFromTradeRequest(command.request);
      }
      if (!engine) throw new Error("Motor de trading no disponible");
      return this.executePerpTrade(engine, command.request);
    }

    if (isSpotCommand(command)) {
      return this.dispatchSpot(command);
    }

    if (!engine) {
      throw new Error("Motor de trading no disponible");
    }

    return this.dispatchPerp(engine, command);
  }

  // ── SPOT (SpotLedger only) ──────────────────────────────────────────────

  private async dispatchSpot(command: ExecutionCommand): Promise<unknown> {
    switch (command.type) {
      case "BUY":
        return this.spotBuyMarket(
          command.walletId,
          command.quantity,
          command.price,
          PORTFOLIO_V1_SYMBOL,
        );
      case "SELL":
        return this.spotSellMarket(
          command.walletId,
          command.quantity,
          command.price,
          PORTFOLIO_V1_SYMBOL,
        );
      case "CANCEL_ORDER":
        return this.spotCancelOrder(command.walletId, command.orderId);
      case "CLOSE_POSITION":
        return this.spotClosePosition(
          command.walletId,
          command.symbol,
          command.marketPrice,
        );
      case "UPDATE_POSITION_TPSL":
        return this.spotUpdateTpSl(command);
      case "FILL_REGISTERED_ORDER":
      case "REJECT_REGISTERED_ORDER":
      case "FORCE_LIQUIDATE":
      case "REGISTER_TRAILING_STOP":
      case "CANCEL_TRAILING_STOP":
      case "TRIGGER_TRAILING_STOP":
      case "EXECUTE_TRADE":
        throw new SpotNotSupportedError();
      default: {
        const _exhaustive: never = command;
        throw new SpotNotSupportedError();
      }
    }
  }

  private async executeSpotFromTradeRequest(
    request: TradeExecutionRequest,
  ): Promise<SpotDispatchResult> {
    assertSpotSupportedTradeRequest(request);

    if (!request.walletId) {
      throw new SpotNotSupportedError();
    }

    const { baseAsset, quoteAsset } = parseSpotSymbolOrThrow(request.symbol);

    // MARKET BUY
    if (request.orderType === "MARKET" && request.direction === "LONG") {
      return this.spotBuyMarket(
        request.walletId,
        request.quantity,
        request.price,
        request.symbol,
      );
    }

    // LIMIT BUY — lock quote
    if (request.orderType === "LIMIT" && request.direction === "LONG") {
      const result = await spotOrderRegistry.registerBuyLimit(request.walletId, {
        baseAsset,
        quoteAsset,
        quantity: request.quantity,
        limitPrice: request.price,
      });
      return {
        domain: "SPOT",
        order: result.order,
        state: result.state,
        pending: true,
      };
    }

    // LIMIT SELL — lock base (inventory sell, not futures short)
    if (request.orderType === "LIMIT" && request.direction === "SHORT") {
      const result = await spotOrderRegistry.registerSellLimit(request.walletId, {
        baseAsset,
        quoteAsset,
        quantity: request.quantity,
        limitPrice: request.price,
      });
      return {
        domain: "SPOT",
        order: result.order,
        state: result.state,
        pending: true,
      };
    }

    // MARKET SELL — inventory exit (UI "Vender", direction SHORT)
    if (request.orderType === "MARKET" && request.direction === "SHORT") {
      return this.spotSellMarket(
        request.walletId,
        request.quantity,
        request.price,
        request.symbol,
      );
    }

    throw new SpotNotSupportedError();
  }

  private async spotCancelOrder(
    walletId: string,
    orderId: string,
  ): Promise<SpotDispatchResult> {
    const result = await spotOrderRegistry.cancel(walletId, orderId);
    return {
      domain: "SPOT",
      order: result.order,
      state: result.state,
      cancelled: true,
    };
  }

  private async spotClosePosition(
    walletId: string,
    symbol: string,
    marketPrice: number,
  ): Promise<SpotDispatchResult> {
    const result = await spotPositionService.closePosition(
      walletId,
      symbol,
      marketPrice,
    );
    return toSpotDispatchResult(result);
  }

  private async spotUpdateTpSl(
    command: Extract<ExecutionCommand, { type: "UPDATE_POSITION_TPSL" }>,
  ): Promise<{ domain: "SPOT"; orders: SpotOrder[] }> {
    const result = await spotPositionService.updateTpSl(
      command.walletId,
      command.symbol,
      command.takeProfitPrice,
      command.stopLossPrice,
    );
    return { domain: "SPOT", orders: result.orders };
  }

  private async executeSpotTrade(
    intent: SpotExecutionIntent,
  ): Promise<SpotDispatchResult> {
    return this.executeSpotFromTradeRequest(
      intentToLegacyRequest("SPOT", intent),
    );
  }

  private async spotBuyMarket(
    walletId: string,
    quantity: number,
    price: number,
    symbol: string,
  ): Promise<SpotDispatchResult> {
    const { baseAsset, quoteAsset } = parseSpotSymbolOrThrow(symbol);
    const ledger = await this.getOrStartSpotLedger(walletId);
    const service = new SpotExecutionService(ledger);
    const result = await service.buyMarket({
      baseAsset,
      quoteAsset,
      quantity,
      price,
    });
    return toSpotDispatchResult(result);
  }

  private async spotSellMarket(
    walletId: string,
    quantity: number,
    price: number,
    symbol: string,
  ): Promise<SpotDispatchResult> {
    const { baseAsset, quoteAsset } = parseSpotSymbolOrThrow(symbol);
    const ledger = await this.getOrStartSpotLedger(walletId);
    const service = new SpotExecutionService(ledger);
    const result = await service.sellMarket({
      baseAsset,
      quoteAsset,
      quantity,
      price,
    });
    return toSpotDispatchResult(result);
  }

  private async getOrStartSpotLedger(walletId: string): Promise<SpotLedger> {
    return spotLedgerRuntime.start(walletId, {
      createIfMissing: true,
      initialUsdt: 0,
    });
  }

  // ── PERP (unchanged stack) ──────────────────────────────────────────────

  private async dispatchPerp(
    engine: PortfolioEngine,
    command: ExecutionCommand,
  ): Promise<unknown> {
    switch (command.type) {
      case "BUY":
        return this.buyPerp(engine, command);
      case "SELL":
        return this.sellPerp(engine, command);
      case "CLOSE_POSITION":
        return this.closePositionPerp(engine, command);
      case "UPDATE_POSITION_TPSL":
        return this.updatePositionTpSlPerp(engine, command);
      case "CANCEL_ORDER":
        return this.cancelOrderPerp(command);
      case "FILL_REGISTERED_ORDER":
        return this.fillRegisteredOrderPerp(engine, command);
      case "REJECT_REGISTERED_ORDER":
        return this.rejectRegisteredOrderPerp(command);
      case "FORCE_LIQUIDATE":
        return this.forceLiquidatePerp(engine, command);
      case "REGISTER_TRAILING_STOP":
        return this.registerTrailingStopPerp(engine, command);
      case "CANCEL_TRAILING_STOP":
        return this.cancelTrailingStopPerp(command);
      case "TRIGGER_TRAILING_STOP":
        return this.triggerTrailingStopPerp(engine, command);
      case "EXECUTE_TRADE":
        return this.executePerpTrade(engine, command.request);
      default: {
        const _exhaustive: never = command;
        throw new Error(
          `ExecutionRouter: unknown PERP command ${(_exhaustive as ExecutionCommand).type}`,
        );
      }
    }
  }

  private async executePerpTrade(
    engine: PortfolioEngine,
    request: TradeExecutionRequest,
  ): Promise<ExecutionResult> {
    return executeTradeRequest(engine, { ...request, domain: "PERP" });
  }

  private async buyPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "BUY" }>,
  ): Promise<PortfolioEngineState> {
    const state = await engine.buy(
      command.quantity,
      command.price,
      command.marketPrice,
    );
    await cancelLinkedOrdersIfPositionFlat(
      engine,
      command.walletId,
      PORTFOLIO_V1_SYMBOL,
      command.marketPrice,
    );
    return state;
  }

  private async sellPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "SELL" }>,
  ): Promise<PortfolioEngineState> {
    const state = await engine.sell(
      command.quantity,
      command.price,
      command.marketPrice,
    );
    await cancelLinkedOrdersIfPositionFlat(
      engine,
      command.walletId,
      PORTFOLIO_V1_SYMBOL,
      command.marketPrice,
    );
    return state;
  }

  private async closePositionPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "CLOSE_POSITION" }>,
  ): Promise<ClosePositionResult> {
    const positions = await engine.getPositions(command.marketPrice);
    const position = positions.find(
      (entry) => entry.symbol === command.symbol && entry.quantity !== 0,
    );
    if (!position || position.quantity === 0) {
      return { state: null };
    }

    const quantity = Math.abs(position.quantity);
    const displaySide = resolvePositionDisplaySide(position);
    engine.setLeverage(position.leverage);
    engine.setMarginMode(position.marginMode);

    const hedge = engine.getAccountPositionMode() === "HEDGE";
    const state =
      displaySide === "LONG"
        ? await engine.sell(quantity, command.marketPrice, command.marketPrice, {
            reduceOnly: hedge,
          })
        : await (async () => {
            if (!hedge) {
              engine.setPositionMode("LONG_SHORT");
            }
            return engine.buy(quantity, command.marketPrice, command.marketPrice, {
              reduceOnly: hedge,
            });
          })();

    await cancelLinkedOrdersIfPositionFlat(
      engine,
      command.walletId,
      command.symbol,
      command.marketPrice,
      displaySide,
    );

    return { state };
  }

  private async updatePositionTpSlPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "UPDATE_POSITION_TPSL" }>,
  ): Promise<UpdateTpSlResult> {
    const positions = await engine.getPositions(command.marketPrice);
    const position = positions.find((entry) => entry.symbol === command.symbol);
    if (!position || position.quantity === 0) {
      throw new Error("Posición no encontrada");
    }

    const orders = await replacePositionTpSl({
      walletId: command.walletId,
      symbol: command.symbol,
      marginMode: position.marginMode,
      leverage: position.leverage,
      quantity: Math.abs(position.quantity),
      margin: position.entryMargin,
      signedQuantity: position.quantity,
      positionSide: position.side ?? null,
      takeProfitPrice: command.takeProfitPrice,
      stopLossPrice: command.stopLossPrice,
    });

    return { orders };
  }

  private async cancelOrderPerp(
    command: Extract<ExecutionCommand, { type: "CANCEL_ORDER" }>,
  ): Promise<CancelOrderResult> {
    const order = await orderRegistryEngine.cancel(command.walletId, command.orderId);
    await cancelOcoCounterpartOnManualCancel(command.walletId, command.orderId);
    return { order };
  }

  private async fillRegisteredOrderPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "FILL_REGISTERED_ORDER" }>,
  ): Promise<FillOrderResult> {
    const order = command.order;
    const marketPrice = command.marketPrice;

    const engineLeverage = Math.min(Math.max(1, order.leverage), 125);
    engine.setLeverage(engineLeverage);
    engine.setMarginMode(order.marginMode);

    const accountPositionMode = engine.getAccountPositionMode();
    const quantityMode = reduceOnlyQuantityMode(accountPositionMode);

    if (accountPositionMode !== "HEDGE" && order.direction === "SHORT") {
      engine.setPositionMode("LONG_SHORT");
    }

    const fillPrice =
      (order.orderType === "STOP_LIMIT" || order.orderType === "TAKE_PROFIT_LIMIT") &&
      order.limitPrice != null &&
      order.limitPrice > 0
        ? order.limitPrice
        : order.triggerPrice;

    let fillQuantity = order.quantity;
    const executionMeta = {
      ...(order.reduceOnly ? { reduceOnly: true as const } : {}),
      ...(order.postOnly ? { postOnly: true as const } : {}),
      executionLiquidity: order.executionLiquidity,
      triggerReason: resolveTriggerReasonFromOrder(order),
    };

    if (order.reduceOnly) {
      const positions = await engine.getPositions(marketPrice);
      const positionQuantity = resolveReduceOnlyPositionQuantity(
        positions,
        accountPositionMode,
        order.symbol,
        order.side,
      );
      fillQuantity = assertReduceOnlyExecution({
        positionQuantity,
        side: order.side,
        requestedQuantity: order.quantity,
        quantityMode,
      });
    }

    if (order.side === "BUY") {
      await engine.buy(fillQuantity, fillPrice, marketPrice, executionMeta);
    } else {
      await engine.sell(fillQuantity, fillPrice, marketPrice, executionMeta);
    }

    await orderRegistryEngine.markFilled(command.walletId, order.id);

    const ocoCancelled = await cancelOcoCounterpartOnFill(command.walletId, order);

    let cancelledSiblings = [...ocoCancelled];
    if (order.positionId) {
      const flatCancelled = await cancelLinkedOrdersIfPositionFlat(
        engine,
        command.walletId,
        order.symbol,
        marketPrice,
        order.direction,
      );
      for (const sibling of flatCancelled) {
        if (!cancelledSiblings.some((entry) => entry.id === sibling.id)) {
          cancelledSiblings.push(sibling);
        }
      }
    }

    return { filled: true, cancelledSiblings };
  }

  private async rejectRegisteredOrderPerp(
    command: Extract<ExecutionCommand, { type: "REJECT_REGISTERED_ORDER" }>,
  ): Promise<OrderEntity> {
    return orderRegistryEngine.markRejected(
      command.walletId,
      command.orderId,
      command.reason,
    );
  }

  private async registerTrailingStopPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "REGISTER_TRAILING_STOP" }>,
  ): Promise<RegisterTrailingStopResult> {
    await trailingStopRuntime.cancelActiveForPositionLeg(
      command.walletId,
      command.symbol,
      command.positionSide,
    );

    const accountPositionMode = engine.getAccountPositionMode();
    const closeSide = command.positionSide === "LONG" ? "SELL" : "BUY";
    const quantityMode = reduceOnlyQuantityMode(accountPositionMode);
    const positions = await engine.getPositions(command.marketPrice);
    const legQty = resolveReduceOnlyPositionQuantity(
      positions,
      accountPositionMode,
      command.symbol,
      closeSide,
    );

    const quantity = clampReduceOnlyQuantity(
      legQty,
      closeSide,
      command.quantity,
      quantityMode,
    );
    if (!(quantity > 0)) {
      throw new Error("No open position leg for trailing stop");
    }

    const trailingStop = buildTrailingStop({
      walletId: command.walletId,
      symbol: command.symbol,
      positionSide: command.positionSide,
      quantity,
      callbackRate: command.callbackRate,
      activationPrice: command.activationPrice,
      markPrice: command.marketPrice,
    });

    const persisted = await trailingStopRuntime.persist(command.walletId, trailingStop);
    return { trailingStop: persisted };
  }

  private async cancelTrailingStopPerp(
    command: Extract<ExecutionCommand, { type: "CANCEL_TRAILING_STOP" }>,
  ): Promise<CancelTrailingStopResult> {
    const trailingStop = await trailingStopRuntime.transition(
      command.walletId,
      command.trailingStopId,
      "CANCELLED",
    );
    return { trailingStop };
  }

  private async triggerTrailingStopPerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "TRIGGER_TRAILING_STOP" }>,
  ): Promise<TriggerTrailingStopResult> {
    const stop = await trailingStopRuntime.getById(
      command.walletId,
      command.trailingStopId,
    );
    if (stop == null || stop.status !== "ACTIVE") {
      throw new Error("Trailing stop is not active");
    }

    const marketPrice = command.marketPrice;
    const accountPositionMode = engine.getAccountPositionMode();
    const quantityMode = reduceOnlyQuantityMode(accountPositionMode);

    if (accountPositionMode !== "HEDGE" && stop.positionSide === "SHORT") {
      engine.setPositionMode("LONG_SHORT");
    }

    const positions = await engine.getPositions(marketPrice);
    const fillQuantity = assertReduceOnlyExecution({
      positionQuantity: resolveReduceOnlyPositionQuantity(
        positions,
        accountPositionMode,
        stop.symbol,
        stop.side,
      ),
      side: stop.side,
      requestedQuantity: stop.quantity,
      quantityMode,
    });

    const executionMeta = {
      reduceOnly: true as const,
      executionLiquidity: resolveMarketExecutionLiquidity(),
      triggerReason: "TRAILING_STOP" as const,
    };

    const state =
      stop.side === "BUY"
        ? await engine.buy(fillQuantity, marketPrice, marketPrice, executionMeta)
        : await engine.sell(fillQuantity, marketPrice, marketPrice, executionMeta);

    const cancelledOco = await cancelOcoGroupsForFlatPositionLeg(
      command.walletId,
      stop.symbol,
      stop.positionSide,
    );

    await trailingStopRuntime.transition(command.walletId, stop.id, "TRIGGERED");

    await cancelLinkedOrdersIfPositionFlat(
      engine,
      command.walletId,
      stop.symbol,
      marketPrice,
      stop.positionSide,
    );

    return { state, cancelledOco };
  }

  private async forceLiquidatePerp(
    engine: PortfolioEngine,
    command: Extract<ExecutionCommand, { type: "FORCE_LIQUIDATE" }>,
  ): Promise<ForceLiquidateResult> {
    await engine.forceClosePosition(command.symbol, command.marketPrice);

    let cancelledLinked: OrderEntity[] = [];
    if (command.walletId) {
      cancelledLinked = await cancelLinkedOrdersIfPositionFlat(
        engine,
        command.walletId,
        command.symbol,
        command.marketPrice,
      );
    }

    return { cancelledLinked };
  }
}

export const executionRouter = new ExecutionRouter();

export function toExecutionRequest(request: TradeExecutionRequest): ExecutionRequest {
  const intent = {
    walletId: request.walletId,
    symbol: request.symbol,
    direction: request.direction,
    orderType: request.orderType,
    marginMode: request.marginMode,
    leverage: request.leverage,
    quantity: request.quantity,
    margin: request.margin,
    price: request.price,
    marketPrice: request.marketPrice,
    tpSlEnabled: request.tpSlEnabled,
    reduceOnlyEnabled: request.reduceOnlyEnabled,
    postOnlyEnabled: request.postOnlyEnabled,
    takeProfitPrice: request.takeProfitPrice,
    stopLossPrice: request.stopLossPrice,
  };

  if (request.domain === "SPOT") {
    return { domain: "SPOT", intent };
  }

  return { domain: "PERP", intent };
}

export function isSpotDispatchResult(
  result: ExecutionResult,
): result is SpotDispatchResult {
  return (
    typeof result === "object" &&
    result != null &&
    "domain" in result &&
    (result as SpotDispatchResult).domain === "SPOT"
  );
}

function isSpotCommand(command: ExecutionCommand): boolean {
  if (command.type === "EXECUTE_TRADE") {
    return command.request.domain === "SPOT";
  }
  return command.domain === "SPOT";
}

/**
 * SPOT supports MARKET/LIMIT buy, MARKET/LIMIT sell (inventory), cancel, close, TP/SL.
 * Rejects margin/leverage≠1/tpSl on trade entry/positionMode.
 */
function assertSpotSupportedTradeRequest(request: TradeExecutionRequest): void {
  if (request.orderType !== "MARKET" && request.orderType !== "LIMIT") {
    throw new SpotNotSupportedError();
  }
  if (request.leverage !== 1) {
    throw new SpotNotSupportedError();
  }
  if (request.marginMode !== "CROSS") {
    throw new SpotNotSupportedError();
  }
  if (request.tpSlEnabled) {
    throw new SpotNotSupportedError();
  }
  if (request.reduceOnlyEnabled) {
    throw new SpotNotSupportedError();
  }
  if (request.postOnlyEnabled) {
    throw new SpotNotSupportedError();
  }
  if (request.takeProfitPrice != null || request.stopLossPrice != null) {
    throw new SpotNotSupportedError();
  }
  if (
    "positionMode" in request &&
    (request as { positionMode?: unknown }).positionMode != null
  ) {
    throw new SpotNotSupportedError();
  }
  if (!request.walletId) {
    throw new SpotNotSupportedError();
  }
}

function parseSpotSymbolOrThrow(symbol: string): {
  baseAsset: string;
  quoteAsset: string;
} {
  try {
    return parseSpotSymbol(symbol);
  } catch {
    throw new SpotNotSupportedError();
  }
}

function toSpotDispatchResult(result: SpotExecutionResult): SpotDispatchResult {
  return {
    domain: "SPOT",
    trade: result.trade,
    state: result.state,
  };
}

function intentToLegacyRequest(
  domain: "SPOT" | "PERP",
  intent: SpotExecutionIntent | PerpExecutionIntent,
): TradeExecutionRequest {
  return {
    domain,
    symbol: PORTFOLIO_V1_SYMBOL,
    walletId: intent.walletId,
    direction: intent.direction,
    orderType: intent.orderType as TradeOrderType,
    marginMode: intent.marginMode,
    leverage: intent.leverage,
    quantity: intent.quantity,
    margin: intent.margin,
    price: intent.price,
    marketPrice: intent.marketPrice,
    tpSlEnabled: intent.tpSlEnabled,
    reduceOnlyEnabled: intent.reduceOnlyEnabled,
    postOnlyEnabled: "postOnlyEnabled" in intent ? intent.postOnlyEnabled : false,
    takeProfitPrice: intent.takeProfitPrice,
    stopLossPrice: intent.stopLossPrice,
  };
}
