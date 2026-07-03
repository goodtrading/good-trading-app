export type WealthSlice = {
  symbol: string;
  name: string;
  quantity: number;
  valueUSD: number;
  percent: number;
};

export type PerformanceWindow = "7D" | "30D" | "90D" | "YTD";

export type PerformanceMetric = {
  window: PerformanceWindow;
  percent: number;
};

/** Read-only portfolio aggregation model — no write semantics. */
export type PortfolioReadModel = {
  schemaVersion: number;
  totalValueUSD: number;
  slices: WealthSlice[];
  performance: PerformanceMetric[];
};

const SLICE_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  USDT: "#26A17B",
  SOL: "#9945FF",
  OTHER: "#666666",
};

export function wealthSliceColor(symbol: string): string {
  return SLICE_COLORS[symbol] ?? SLICE_COLORS.OTHER;
}
