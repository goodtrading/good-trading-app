import type { DataStatus } from "@/shared/mobileMarketStateV2.contract";

import { shouldHideMetric } from "@/lib/market-state/dataStatusUi";
import type { MarketStateSource } from "@/lib/market-state/fallbackPolicy";
import type { MacroContext, MicroContext } from "@/lib/market-state/v2DataSchema";

type SpotField = {
  value?: number | null;
  status?: DataStatus;
} | null | undefined;

export function isSpotUsable(spot: SpotField): boolean {
  if (!spot) return false;
  if (spot.status === "unavailable" || spot.status === "not_applicable") return false;
  if (spot.status && shouldHideMetric(spot.status)) return false;
  const value = spot.value;
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isLegacyHomeReady(market: unknown): boolean {
  if (!market || typeof market !== "object") return false;
  const spot = (market as { market?: { spot?: unknown } }).market?.spot;
  return typeof spot === "number" && Number.isFinite(spot) && spot > 0;
}

export function isV2HomeReady(input: {
  data: unknown | null;
  micro: MicroContext | null | undefined;
  macro: MacroContext | null | undefined;
  spot: SpotField;
}): boolean {
  return Boolean(
    input.data && input.micro && input.macro && isSpotUsable(input.spot),
  );
}

export function resolveIsHomeReady(input: {
  v2Enabled: boolean;
  marketStateSource: MarketStateSource;
  v2: {
    data: unknown | null;
    micro: MicroContext | null | undefined;
    macro: MacroContext | null | undefined;
    spot: SpotField;
  };
  legacyMarket: unknown;
}): boolean {
  const preferV2 = input.v2Enabled && input.marketStateSource === "v2";
  if (preferV2) {
    return isV2HomeReady(input.v2);
  }

  if (input.marketStateSource === "legacy") {
    return isLegacyHomeReady(input.legacyMarket);
  }

  return false;
}
