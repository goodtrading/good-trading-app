import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";

/** Exchange-style lot rules for paper trading symbols. */
export type SymbolLotRules = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** Minimum order quantity in base units. */
  minQty: number;
  /** Quantity increment — also defines dust epsilon (stepSize / 2). */
  stepSize: number;
};

const SYMBOL_RULES: Record<string, SymbolLotRules> = {
  [PORTFOLIO_V1_SYMBOL]: {
    symbol: PORTFOLIO_V1_SYMBOL,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    minQty: 0.00001,
    stepSize: 0.00001,
  },
  ETHUSDT: {
    symbol: "ETHUSDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    minQty: 0.0001,
    stepSize: 0.0001,
  },
  SOLUSDT: {
    symbol: "SOLUSDT",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    minQty: 0.01,
    stepSize: 0.01,
  },
  XRPUSDT: {
    symbol: "XRPUSDT",
    baseAsset: "XRP",
    quoteAsset: "USDT",
    minQty: 1,
    stepSize: 1,
  },
};

export function getSymbolRules(symbol: string): SymbolLotRules {
  const key = symbol.trim().toUpperCase();
  const rules = SYMBOL_RULES[key];
  if (rules) return rules;
  return {
    symbol: key,
    baseAsset: key.replace(/USDT$/, ""),
    quoteAsset: "USDT",
    minQty: 0.00001,
    stepSize: 0.00001,
  };
}

/** Dust threshold derived from stepSize — not a magic constant. */
export function dustEpsilon(symbol: string): number {
  const { stepSize, minQty } = getSymbolRules(symbol);
  return Math.min(minQty, stepSize) / 2;
}

/** Micro-tolerance for float step flooring — derived from stepSize, not a global epsilon. */
export function stepFloorBias(symbol: string): number {
  const { stepSize } = getSymbolRules(symbol);
  return stepSize / 1_000_000;
}
