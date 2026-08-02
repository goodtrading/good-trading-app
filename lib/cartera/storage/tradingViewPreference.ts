/**
 * @deprecated Use `@/lib/cartera/storage/tradingModePreference` (SPOT / PERP).
 * Kept as a thin compatibility shim for older imports.
 */
export type {
  TradingMode as TradingViewPreference,
} from "./tradingModePreference";
export {
  DEFAULT_TRADING_MODE as DEFAULT_TRADING_VIEW,
  TRADING_MODE_STORAGE_KEY as TRADING_VIEW_PREFERENCE_STORAGE_KEY,
  loadTradingMode as loadTradingViewPreference,
  saveTradingMode as saveTradingViewPreference,
} from "./tradingModePreference";
