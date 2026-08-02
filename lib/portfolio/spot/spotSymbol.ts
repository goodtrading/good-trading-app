import { SpotValidationError } from "@/lib/portfolio/spot/SpotExecutionService";

export function parseSpotSymbol(symbol: string): {
  baseAsset: string;
  quoteAsset: string;
} {
  const upper = symbol.toUpperCase();
  if (upper.endsWith("USDT") && upper.length > 4) {
    return { baseAsset: upper.slice(0, -4), quoteAsset: "USDT" };
  }
  throw new SpotValidationError(`Invalid spot symbol: ${symbol}`);
}

export function buildSpotPositionId(walletId: string, baseAsset: string): string {
  return `spot:${walletId}:${baseAsset.trim().toUpperCase()}`;
}
