import { SpotExecutionService } from "@/lib/portfolio/spot/SpotExecutionService";
import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { spotOrderRegistry } from "@/lib/portfolio/spot/orders/SpotOrderRegistry";
import { spotPositionRuntime } from "@/lib/portfolio/spot/SpotPositionRuntime";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import {
  isEffectivelyZero,
  resolveCanonicalCloseQuantity,
} from "@/lib/portfolio/sizing/PositionSizing";
import type { SpotExecutionResult } from "@/lib/portfolio/spot/SpotExecutionService";
import type { SpotOrder } from "@/lib/portfolio/spot/types";
import { parseSpotSymbol } from "@/lib/portfolio/spot/spotSymbol";

export type SpotClosePositionResult = SpotExecutionResult;

export type SpotUpdateTpSlResult = {
  orders: SpotOrder[];
};

/**
 * SPOT position exit flows — inventory only, never PERP stack.
 * Full close quantity always from SpotPosition.quantity via PositionSizing.
 */
export class SpotPositionService {
  /** 100% MARKET close — position quantity is the only sizing input. */
  async closePosition(
    walletId: string,
    symbol: string,
    marketPrice: number,
  ): Promise<SpotClosePositionResult> {
    const { baseAsset, quoteAsset } = parseSpotSymbol(symbol);
    const position = this.findOpenPosition(walletId, symbol);
    if (!position) {
      throw new Error("Sin inventario para cerrar");
    }

    await this.cancelOpenOrders(walletId, baseAsset);

    const quantity = resolveCanonicalCloseQuantity({
      symbol,
      quantity: position.quantity,
    });

    if (isEffectivelyZero(symbol, quantity)) {
      throw new Error("Sin inventario para cerrar");
    }

    return this.executeMarketClose(walletId, {
      baseAsset,
      quoteAsset,
      quantity,
      price: marketPrice,
    });
  }

  /**
   * Replace TP (LIMIT SELL) and SL (STOP SELL) for a base asset holding.
   * Pass null prices to remove both.
   */
  async updateTpSl(
    walletId: string,
    symbol: string,
    takeProfitPrice: number | null,
    stopLossPrice: number | null,
  ): Promise<SpotUpdateTpSlResult> {
    const { baseAsset, quoteAsset } = parseSpotSymbol(symbol);

    await spotOrderRegistry.cancelTpSlForAsset(walletId, baseAsset);

    if (takeProfitPrice == null && stopLossPrice == null) {
      return { orders: [] };
    }

    const position = this.findOpenPosition(walletId, symbol);
    const quantity = position
      ? resolveCanonicalCloseQuantity({ symbol, quantity: position.quantity })
      : 0;

    if (isEffectivelyZero(symbol, quantity)) {
      throw new Error("Sin inventario para TP/SL");
    }

    const orders: SpotOrder[] = [];

    if (takeProfitPrice != null && takeProfitPrice > 0) {
      const tp = await spotOrderRegistry.registerSellLimit(walletId, {
        baseAsset,
        quoteAsset,
        quantity,
        limitPrice: takeProfitPrice,
        purpose: "TAKE_PROFIT",
        positionAsset: baseAsset,
      });
      orders.push(tp.order);
    }

    if (stopLossPrice != null && stopLossPrice > 0) {
      const sl = await spotOrderRegistry.registerStopSell(walletId, {
        baseAsset,
        quoteAsset,
        quantity,
        limitPrice: stopLossPrice,
        purpose: "STOP_LOSS",
        positionAsset: baseAsset,
      });
      orders.push(sl.order);
    }

    return { orders };
  }

  private findOpenPosition(
    walletId: string,
    symbol: string,
  ): SpotPositionLive | undefined {
    return spotPositionRuntime
      .listOpen(walletId)
      .find((p) => p.symbol === symbol && p.status === "OPEN");
  }

  private async cancelOpenOrders(walletId: string, baseAsset: string): Promise<void> {
    await spotOrderRegistry.cancelTpSlForAsset(walletId, baseAsset);
    await spotOrderRegistry.cancelOpenSellsForAsset(walletId, baseAsset);
  }

  private async executeMarketClose(
    walletId: string,
    input: {
      baseAsset: string;
      quoteAsset: string;
      quantity: number;
      price: number;
    },
  ): Promise<SpotClosePositionResult> {
    const ledger = await this.ledgerFor(walletId);
    const service = new SpotExecutionService(ledger);
    return service.sellMarket(input);
  }

  private async ledgerFor(walletId: string): Promise<SpotLedger> {
    return spotLedgerRuntime.start(walletId, { createIfMissing: true });
  }
}

export const spotPositionService = new SpotPositionService();
