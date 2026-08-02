import type { TradingDomain } from "@/lib/portfolio/domain/types/execution";
import type { MarginMode } from "@/lib/portfolio/types";
import type { TradeExecutionRequest } from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";

/** All write commands accepted by ExecutionRouter (Phase 3). */
export type ExecutionCommand =
  | { type: "EXECUTE_TRADE"; request: TradeExecutionRequest }
  | {
      type: "BUY";
      domain: TradingDomain;
      walletId: string;
      quantity: number;
      price: number;
      marketPrice: number;
    }
  | {
      type: "SELL";
      domain: TradingDomain;
      walletId: string;
      quantity: number;
      price: number;
      marketPrice: number;
    }
  | {
      type: "CLOSE_POSITION";
      domain: TradingDomain;
      walletId: string;
      symbol: string;
      marketPrice: number;
    }
  | {
      type: "UPDATE_POSITION_TPSL";
      domain: TradingDomain;
      walletId: string;
      symbol: string;
      marketPrice: number;
      takeProfitPrice: number | null;
      stopLossPrice: number | null;
    }
  | {
      type: "CANCEL_ORDER";
      domain: TradingDomain;
      walletId: string;
      orderId: string;
    }
  | {
      type: "FILL_REGISTERED_ORDER";
      domain: TradingDomain;
      walletId: string;
      order: OrderEntity;
      marketPrice: number;
    }
  | {
      type: "REJECT_REGISTERED_ORDER";
      domain: TradingDomain;
      walletId: string;
      orderId: string;
      reason: string;
    }
  | {
      type: "FORCE_LIQUIDATE";
      domain: TradingDomain;
      walletId: string | null;
      symbol: string;
      marketPrice: number;
    }
  | {
      type: "REGISTER_TRAILING_STOP";
      domain: TradingDomain;
      walletId: string;
      symbol: string;
      positionSide: import("@/lib/portfolio/hedge/PerpAccountPositionMode").PositionSide;
      quantity: number;
      callbackRate: number;
      activationPrice?: number | null;
      marketPrice: number;
    }
  | {
      type: "CANCEL_TRAILING_STOP";
      domain: TradingDomain;
      walletId: string;
      trailingStopId: string;
    }
  | {
      type: "TRIGGER_TRAILING_STOP";
      domain: TradingDomain;
      walletId: string;
      trailingStopId: string;
      marketPrice: number;
    };

export type BuySellResult = {
  state: import("@/lib/portfolio/types").PortfolioEngineState;
};

export type ClosePositionResult = {
  state: import("@/lib/portfolio/types").PortfolioEngineState | null;
};

export type UpdateTpSlResult = {
  orders: OrderEntity[];
};

export type CancelOrderResult = {
  order: OrderEntity;
};

export type FillOrderResult = {
  filled: boolean;
  cancelledSiblings: OrderEntity[];
};

export type TriggerTrailingStopResult = {
  state: import("@/lib/portfolio/types").PortfolioEngineState;
  cancelledOco: import("@/lib/portfolio/orderRegistry/OrderEntity").OrderEntity[];
};

export type RegisterTrailingStopResult = {
  trailingStop: import("@/lib/portfolio/trailing/TrailingStop").TrailingStop;
};

export type CancelTrailingStopResult = {
  trailingStop: import("@/lib/portfolio/trailing/TrailingStop").TrailingStop;
};

/** Shared fields for position-linked TP/SL updates. */
export type PositionTpSlParams = {
  marginMode: MarginMode;
  leverage: number;
  quantity: number;
  margin: number;
  signedQuantity: number;
};
