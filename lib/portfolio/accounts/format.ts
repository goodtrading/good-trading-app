import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";

export function formatUsd(value: number, decimals = 2): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatSignedUsd(value: number, decimals = 2): string {
  if (value === 0) return formatUsd(0, decimals);
  const sign = value > 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatQuantity(value: number, maxDecimals = 2): string {
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return Math.round(rounded).toLocaleString("en-US");
  }
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

export function displaySymbol(symbol: string): string {
  if (symbol === PORTFOLIO_V1_SYMBOL) return "BTC";
  return symbol;
}

export function parsePositiveNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function accountAvatarLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "P";
}

export function signedValueColor(
  value: number,
  palette: { success: string; primary: string; foreground: string },
): string {
  if (value > 0) return palette.success;
  if (value < 0) return palette.primary;
  return palette.foreground;
}
