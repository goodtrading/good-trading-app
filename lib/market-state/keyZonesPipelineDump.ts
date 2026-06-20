import {
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  type KeyZoneViewModel,
} from "./v2UiMappers";
import type { MobileMarketStateV2Snapshot } from "./parseV2Snapshot";
import type { MacroContext, MicroContext } from "./v2DataSchema";
import type { KeyZonesStableBranch } from "./keyZonesRuntimeAudit";

type MarketStateV2HookView = {
  data: MobileMarketStateV2Snapshot | null;
  micro: MicroContext | null;
  macro: MacroContext | null;
  hasSnapshot: boolean;
  [key: string]: unknown;
};

export type KeyZonesPipelineRuntimeDump = {
  marketStateV2: Record<string, unknown>;
  marketStateV2Data: MobileMarketStateV2Snapshot | null;
  marketStateV2DataMicro: MicroContext | null | undefined;
  marketStateV2DataMacro: MacroContext | null | undefined;
  marketStateV2HookMicro: MicroContext | null;
  marketStateV2HookMacro: MacroContext | null;
  hasV2Data: boolean;
  hasV2Micro: boolean;
  hasV2Macro: boolean;
  shouldUseV2KeyZones: boolean;
  gammaV2Active: boolean;
  stableBranch: KeyZonesStableBranch;
  mapperMicroCount: number;
  mapperMacroCount: number;
  mapperMicroLabels: string[];
  mapperMacroLabels: string[];
  keyZonesCardZoneCount: number;
  keyZonesCardLabels: string[];
  marketScope: string;
};

function snapshotKeysOnly(snapshot: MobileMarketStateV2Snapshot | null): MobileMarketStateV2Snapshot | null {
  if (!snapshot) return null;
  return snapshot;
}

function hookViewForLog(view: MarketStateV2HookView): Record<string, unknown> {
  return {
    hasSnapshot: view.hasSnapshot,
    hasData: Boolean(view.data),
    hasMicro: Boolean(view.micro),
    hasMacro: Boolean(view.macro),
    isLoading: view.isLoading,
    isRefreshing: view.isRefreshing,
    sessionStatus: view.sessionStatus,
    errorCode: (view.error as { code?: string } | null)?.code ?? null,
    snapshotId: view.data?.meta?.snapshotId ?? null,
    innerDataKeys: view.data?.data ? Object.keys(view.data.data) : null,
  };
}

export function buildKeyZonesPipelineRuntimeDump(input: {
  marketStateV2: MarketStateV2HookView;
  marketStateSource: string;
  isV2MarketState: boolean;
  shouldUseV2KeyZones: boolean;
  gammaV2Active: boolean;
  stableBranch: KeyZonesStableBranch;
  zones: KeyZoneViewModel[];
  marketScope: string;
  spot: number | null;
}): KeyZonesPipelineRuntimeDump {
  const microMapped = input.marketStateV2.micro
    ? mapKeyZonesFromMicro(input.marketStateV2.micro, input.spot)
    : [];
  const macroMapped = input.marketStateV2.macro
    ? mapKeyZonesFromMacro(input.marketStateV2.macro, input.spot)
    : [];

  return {
    marketStateV2: {
      ...hookViewForLog(input.marketStateV2),
      marketStateSource: input.marketStateSource,
      isV2MarketState: input.isV2MarketState,
    },
    marketStateV2Data: snapshotKeysOnly(input.marketStateV2.data),
    marketStateV2DataMicro: input.marketStateV2.data?.data?.micro,
    marketStateV2DataMacro: input.marketStateV2.data?.data?.macro,
    marketStateV2HookMicro: input.marketStateV2.micro,
    marketStateV2HookMacro: input.marketStateV2.macro,
    hasV2Data: Boolean(input.marketStateV2.data),
    hasV2Micro: Boolean(input.marketStateV2.micro),
    hasV2Macro: Boolean(input.marketStateV2.macro),
    shouldUseV2KeyZones: input.shouldUseV2KeyZones,
    gammaV2Active: input.gammaV2Active,
    stableBranch: input.stableBranch,
    mapperMicroCount: microMapped.length,
    mapperMacroCount: macroMapped.length,
    mapperMicroLabels: microMapped.map((z) => z.label),
    mapperMacroLabels: macroMapped.map((z) => z.label),
    keyZonesCardZoneCount: input.zones.length,
    keyZonesCardLabels: input.zones.map((z) => z.label),
    marketScope: input.marketScope,
  };
}

export function logKeyZonesPipelineRuntimeDump(dump: KeyZonesPipelineRuntimeDump): void {
  if (!__DEV__) return;
  console.log("===== KeyZones Pipeline Runtime Dump =====");
  console.log("1. marketStateV2:", JSON.stringify(dump.marketStateV2, null, 2));
  console.log("2. marketStateV2.data:", dump.marketStateV2Data ? "[snapshot-present]" : null);
  if (dump.marketStateV2Data) {
    console.log(JSON.stringify(dump.marketStateV2Data, null, 2));
  }
  console.log("3. marketStateV2.data.micro (nested):", dump.marketStateV2DataMicro ?? null);
  console.log("3b. marketStateV2.micro (hook):", dump.marketStateV2HookMicro ?? null);
  console.log("4. marketStateV2.data.macro (nested):", dump.marketStateV2DataMacro ?? null);
  console.log("4b. marketStateV2.macro (hook):", dump.marketStateV2HookMacro ?? null);
  console.log("5. hasV2Data:", dump.hasV2Data);
  console.log("5. hasV2Micro:", dump.hasV2Micro);
  console.log("5. hasV2Macro:", dump.hasV2Macro);
  console.log("5. shouldUseV2KeyZones:", dump.shouldUseV2KeyZones);
  console.log("5. gammaV2Active:", dump.gammaV2Active);
  console.log("6. useStableKeyZones branch:", dump.stableBranch);
  console.log("7. mapKeyZonesFromMicro count:", dump.mapperMicroCount);
  console.log("7. mapKeyZonesFromMicro labels:", JSON.stringify(dump.mapperMicroLabels));
  console.log("8. mapKeyZonesFromMacro count:", dump.mapperMacroCount);
  console.log("8. mapKeyZonesFromMacro labels:", JSON.stringify(dump.mapperMacroLabels));
  console.log("9. KeyZonesCard zoneCount:", dump.keyZonesCardZoneCount);
  console.log("10. KeyZonesCard labels:", JSON.stringify(dump.keyZonesCardLabels));
  console.log("marketScope:", dump.marketScope);
  console.log("==========================================");
}
