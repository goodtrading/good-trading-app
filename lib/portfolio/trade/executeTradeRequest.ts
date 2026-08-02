import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  cancelLinkedOrdersIfPositionFlat,
  registerTpSlForOpenPosition,
} from "@/lib/portfolio/orderRegistry/syncPositionOrders";
import type { PortfolioEngine } from "@/lib/portfolio/portfolioEngine";
import {
  resolveLimitExecutionLiquidity,
  resolveMarketExecutionLiquidity,
} from "@/lib/portfolio/execution/ExecutionLiquidityResolver";
import {
  reduceOnlyQuantityMode,
  resolveReduceOnlyPositionQuantity,
} from "@/lib/portfolio/hedge/resolveReduceOnlyContext";
import { assertPostOnly } from "@/lib/portfolio/postOnly/PostOnlyValidator";
import { assertReduceOnlyExecution } from "@/lib/portfolio/reduceOnly/ReduceOnlyValidator";
import type { PortfolioEngineState } from "@/lib/portfolio/types";
import type { TradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";

/**
 * Executes a Classic trade request.
 *
 * MARKET → PortfolioEngine buy/sell (ledger write)
 *          then optionally register TP/SL via OrderRegistryEngine (PENDING only)
 * LIMIT  → OrderRegistryEngine.register PENDING only (no position / ledger)
 *          OrderPriceEvaluator later fills via PortfolioEngine
 */
export async function executeTradeRequest(
  engine: PortfolioEngine,
  request: TradeExecutionRequest,
): Promise<PortfolioEngineState | { orderId: string; pending: true }> {
  console.log("[TRADE EXECUTION REQUEST]", {
    symbol: request.symbol,
    walletId: request.walletId,
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
  });

  const side = request.direction === "LONG" ? "BUY" : "SELL";
  const accountPositionMode = engine.getAccountPositionMode();
  const quantityMode = reduceOnlyQuantityMode(accountPositionMode);

  if (request.orderType === "LIMIT") {
    if (!request.walletId) {
      throw new Error("LIMIT orders require walletId");
    }

    let quantity = request.quantity;
    if (request.reduceOnlyEnabled) {
      const positions = await engine.getPositions(request.marketPrice);
      const positionQuantity = resolveReduceOnlyPositionQuantity(
        positions,
        accountPositionMode,
        request.symbol,
        side,
      );
      quantity = assertReduceOnlyExecution({
        positionQuantity,
        side,
        requestedQuantity: request.quantity,
        quantityMode,
      });
    }

    let executionLiquidity = resolveLimitExecutionLiquidity({
      side,
      limitPrice: request.price,
      markPrice: request.marketPrice,
      postOnly: request.postOnlyEnabled,
    });
    if (request.postOnlyEnabled) {
      assertPostOnly({
        side,
        limitPrice: request.price,
        markPrice: request.marketPrice,
        orderType: request.orderType,
      });
    }

    const order = await orderRegistryEngine.register({
      walletId: request.walletId,
      symbol: request.symbol,
      side,
      direction: request.direction,
      orderType: "LIMIT",
      marginMode: request.marginMode,
      leverage: request.leverage,
      triggerPrice: request.price,
      quantity,
      margin: request.margin,
      positionId: null,
      reduceOnly: request.reduceOnlyEnabled,
      postOnly: request.postOnlyEnabled,
      executionLiquidity,
    });

    return { orderId: order.id, pending: true };
  }

  // MARKET — apply leverage / margin mode and open/close position immediately.
  if (request.postOnlyEnabled) {
    assertPostOnly({
      side,
      limitPrice: request.price,
      markPrice: request.marketPrice,
      orderType: request.orderType,
    });
  }

  const engineLeverage = Math.min(Math.max(1, request.leverage), 125);
  engine.setLeverage(engineLeverage);
  engine.setMarginMode(request.marginMode);

  if (accountPositionMode !== "HEDGE" && request.direction === "SHORT") {
    engine.setPositionMode("LONG_SHORT");
  }

  let quantity = request.quantity;
  const executionMeta = {
    ...(request.reduceOnlyEnabled ? { reduceOnly: true as const } : {}),
    executionLiquidity: resolveMarketExecutionLiquidity(),
  };

  if (request.reduceOnlyEnabled) {
    const positions = await engine.getPositions(request.marketPrice);
    const positionQuantity = resolveReduceOnlyPositionQuantity(
      positions,
      accountPositionMode,
      request.symbol,
      side,
    );
    quantity = assertReduceOnlyExecution({
      positionQuantity,
      side,
      requestedQuantity: request.quantity,
      quantityMode,
    });
  }

  const state =
    side === "BUY"
      ? await engine.buy(quantity, request.price, request.marketPrice, executionMeta)
      : await engine.sell(quantity, request.price, request.marketPrice, executionMeta);

  if (request.walletId) {
    const cancelled = await cancelLinkedOrdersIfPositionFlat(
      engine,
      request.walletId,
      request.symbol,
      request.marketPrice,
      request.direction,
    );

    if (cancelled.length === 0) {
      await registerTpSlForOpenPosition(engine, request);
    }
  }

  return state;
}
