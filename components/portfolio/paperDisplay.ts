import type { Position } from "@/lib/portfolio/types";

export type PaperDisplayCurrency = "USDT" | "BTC" | "ETH";

export const PAPER_CURRENCY_OPTIONS: PaperDisplayCurrency[] = ["USDT", "BTC", "ETH"];

export type PaperConversionRates = {
  btc: number;
  eth: number;
};

export function maskDisplayValue(text: string, hidden: boolean): string {
  return hidden ? "••••••" : text;
}

export function convertUsdToPaperCurrency(
  usdValue: number,
  currency: PaperDisplayCurrency,
  rates: PaperConversionRates,
): number {
  if (currency === "USDT") return usdValue;
  if (currency === "BTC") return rates.btc > 0 ? usdValue / rates.btc : usdValue;
  return rates.eth > 0 ? usdValue / rates.eth : usdValue;
}

export function formatPaperCurrencyAmount(
  usdValue: number,
  currency: PaperDisplayCurrency,
  rates: PaperConversionRates,
): string {
  const converted = convertUsdToPaperCurrency(usdValue, currency, rates);

  if (currency === "USDT") {
    return `${converted.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }

  if (currency === "BTC") {
    const decimals = Number.isInteger(converted) ? 0 : converted < 1 ? 4 : 2;
    return `${converted.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.min(decimals, 6),
    })} BTC`;
  }

  return `${converted.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ETH`;
}

export function formatPaperPnlPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

export function computePositionReturnPercent(position: Position): number {
  const costBasis = position.quantity * position.avgEntry;
  if (costBasis <= 0) return 0;
  return Number(((position.unrealizedPnL / costBasis) * 100).toFixed(2));
}
