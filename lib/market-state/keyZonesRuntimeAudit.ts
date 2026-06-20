import type { MarketStateSource } from "@/lib/market-state/fallbackPolicy";
import type { KeyZoneViewModel } from "@/lib/market-state/v2UiMappers";
import type { MarketScopeLabel } from "@/lib/market-state/keyZoneSelectors";

export type KeyZonesRuntimeAudit = {
  source: MarketStateSource;
  hasSnapshot: boolean;
  hasData: boolean;
  hasMicro: boolean;
  hasMacro: boolean;
  shouldUseV2: boolean;
  gammaEffectiveBranch: "v2" | "legacy";
  institutionalDataPath: string;
  gammaDataPath: string;
  keyZonesDataPath: string;
  auditInspectedPath: string;
  stableBranch: KeyZonesStableBranch;
  zoneCount: number;
  labels: string[];
  mode: MarketScopeLabel;
};

export type KeyZonesStableBranch =
  | "legacy-fallback"
  | "v2-selector"
  | "v2-context-missing"
  | "v2-cache-hit"
  | "v2-cache-updated";

export function resolveKeyZonesStableBranch(args: {
  enabled: boolean;
  micro: unknown;
  macro: unknown;
  cacheSignature: string;
  nextSignature: string;
}): KeyZonesStableBranch {
  if (!args.enabled) return "legacy-fallback";
  if (!args.micro || !args.macro) return "v2-context-missing";
  if (args.cacheSignature === args.nextSignature && args.cacheSignature.length > 0) {
    return "v2-cache-hit";
  }
  if (args.cacheSignature.length > 0) return "v2-cache-updated";
  return "v2-selector";
}

export function buildKeyZonesRuntimeAudit(input: {
  marketStateSource: MarketStateSource;
  hasSnapshot: boolean;
  hasData: boolean;
  hasMicro: boolean;
  hasMacro: boolean;
  shouldUseV2: boolean;
  gammaEffectiveBranch: "v2" | "legacy";
  stableBranch: KeyZonesStableBranch;
  zones: KeyZoneViewModel[];
  mode: MarketScopeLabel;
}): KeyZonesRuntimeAudit {
  const gammaUsesV2 = input.gammaEffectiveBranch === "v2";
  return {
    source: input.marketStateSource,
    hasSnapshot: input.hasSnapshot,
    hasData: input.hasData,
    hasMicro: input.hasMicro,
    hasMacro: input.hasMacro,
    shouldUseV2: input.shouldUseV2,
    gammaEffectiveBranch: input.gammaEffectiveBranch,
    institutionalDataPath: "legacyMarketQuery.data → raw",
    gammaDataPath: gammaUsesV2
      ? `marketStateV2.${input.mode === "Micro" ? "micro" : "macro"}`
      : "legacyMarketQuery.data → raw",
    keyZonesDataPath: input.shouldUseV2
      ? "marketStateV2.micro + marketStateV2.macro → useStableKeyZones"
      : "legacyMarketQuery.data → raw.levels (callWall, putWall)",
    auditInspectedPath: "marketStateV2 hook (data, micro, macro, hasSnapshot)",
    stableBranch: input.stableBranch,
    zoneCount: input.zones.length,
    labels: input.zones.map((zone) => zone.label),
    mode: input.mode,
  };
}

export function logKeyZonesRuntimeAudit(audit: KeyZonesRuntimeAudit): void {
  if (!__DEV__) return;
  console.log("[KeyZones Audit]");
  console.log(`source: ${audit.source}`);
  console.log(`hasSnapshot: ${audit.hasSnapshot}`);
  console.log(`hasData: ${audit.hasData}`);
  console.log(`hasMicro: ${audit.hasMicro}`);
  console.log(`hasMacro: ${audit.hasMacro}`);
  console.log(`shouldUseV2: ${audit.shouldUseV2}`);
  console.log(`gammaEffectiveBranch: ${audit.gammaEffectiveBranch}`);
  console.log(`institutionalDataPath: ${audit.institutionalDataPath}`);
  console.log(`gammaDataPath: ${audit.gammaDataPath}`);
  console.log(`keyZonesDataPath: ${audit.keyZonesDataPath}`);
  console.log(`auditInspectedPath: ${audit.auditInspectedPath}`);
  console.log(`stableBranch: ${audit.stableBranch}`);
  console.log(`zoneCount: ${audit.zoneCount}`);
  console.log(`labels: ${JSON.stringify(audit.labels)}`);
  console.log(`mode: ${audit.mode}`);
}

export function auditSignature(zones: KeyZoneViewModel[]): string {
  return JSON.stringify(zones.map((z) => z.label));
}
