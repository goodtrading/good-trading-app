import type { TradeOrderType } from "@/lib/portfolio/trade/TradeExecutionRequest";
import type { TradingMode } from "@/lib/cartera/storage/tradingModePreference";

export type TradeEntryFieldErrors = {
  margin?: string;
  price?: string;
  leverage?: string;
  marketPrice?: string;
};

export type TradeEntryValidationInput = {
  margin: number | null;
  entryPrice: number | null;
  orderType: TradeOrderType;
  leverage: number;
  marketPrice: number;
  cashBalance: number | null;
  tradingMode?: TradingMode;
  inventoryBalance?: number | null;
  derivedQuantity?: number | null;
};

export type TradeEntryValidationResult = {
  errors: TradeEntryFieldErrors;
  canExecute: boolean;
  canExecuteLong: boolean;
  canExecuteShort: boolean;
};

export function validateTradeEntry(
  input: TradeEntryValidationInput,
): TradeEntryValidationResult {
  const errors: TradeEntryFieldErrors = {};

  if (input.marketPrice <= 0) {
    errors.marketPrice = "Activo sin precio de mercado";
  }

  if (input.margin == null || Number.isNaN(input.margin)) {
    errors.margin = "Margen inválido";
  } else if (input.margin <= 0) {
    errors.margin = "El margen debe ser mayor a cero";
  }

  if (!Number.isFinite(input.leverage) || input.leverage <= 0 || input.leverage > 125) {
    errors.leverage = "Apalancamiento inválido (1–125)";
  }

  if (input.orderType === "LIMIT") {
    if (input.entryPrice == null || input.entryPrice <= 0) {
      errors.price = "Precio LIMIT inválido";
    }
  } else if (input.entryPrice == null || input.entryPrice <= 0) {
    errors.price = "Precio de mercado no disponible";
  }

  const baseErrors = { ...errors };
  const longErrors = { ...baseErrors };
  const shortErrors = { ...baseErrors };

  if (input.cashBalance != null && input.margin != null && input.margin > input.cashBalance) {
    longErrors.margin = "El margen supera el balance disponible";
    if (input.tradingMode !== "SPOT") {
      shortErrors.margin = "El margen supera el balance disponible";
    }
  }

  if (
    input.tradingMode === "SPOT" &&
    input.derivedQuantity != null &&
    input.inventoryBalance != null &&
    input.derivedQuantity > input.inventoryBalance
  ) {
    shortErrors.margin = "La cantidad supera el inventario disponible";
  }

  const canExecuteLong = Object.keys(longErrors).length === 0;
  const canExecuteShort = Object.keys(shortErrors).length === 0;

  return {
    errors: baseErrors,
    canExecute: canExecuteLong && canExecuteShort,
    canExecuteLong,
    canExecuteShort,
  };
}
