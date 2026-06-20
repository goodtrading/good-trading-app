import type { MacroContext, MicroContext } from "./v2DataSchema";
import {
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  type KeyZoneViewModel,
} from "./v2UiMappers";
import {
  selectKeyZonesForScope,
  type MarketScopeLabel,
} from "./keyZoneSelectors";

export type KeyZonePipelineZone = {
  label: string;
  price: string;
  source: "v2-micro-mapper" | "v2-macro-mapper" | "v2-selector" | "legacy-fallback" | "stable-hook";
  context: MarketScopeLabel | "legacy";
};

export type FlipFieldAudit = {
  field: string;
  status: string;
  value: number | string | null;
};

function toPipelineZones(
  zones: KeyZoneViewModel[],
  source: KeyZonePipelineZone["source"],
  context: KeyZonePipelineZone["context"],
): KeyZonePipelineZone[] {
  return zones.map((zone) => ({
    label: zone.label,
    price: zone.price,
    source,
    context,
  }));
}

export function auditFlipFields(micro: MicroContext | null, macro: MacroContext | null): FlipFieldAudit[] {
  const rows: FlipFieldAudit[] = [];
  if (micro) {
    rows.push({
      field: "micro.localGammaFlip",
      status: micro.localGammaFlip.status,
      value: micro.localGammaFlip.value,
    });
  }
  if (macro) {
    rows.push({
      field: "macro.globalGammaFlip",
      status: macro.globalGammaFlip.status,
      value: macro.globalGammaFlip.value,
    });
    rows.push({
      field: "macro.dealerPivot",
      status: macro.dealerPivot.status,
      value: macro.dealerPivot.value,
    });
    rows.push({
      field: "macro.dominantExpiry",
      status: macro.dominantExpiry.status,
      value: macro.dominantExpiry.instrumentCode,
    });
    rows.push({
      field: "macro.structuralMagnets",
      status: "array",
      value: macro.structuralMagnets.length,
    });
    rows.push({
      field: "macro.shortGammaPockets",
      status: "array",
      value: macro.shortGammaPockets.length,
    });
  }
  return rows;
}

export function auditKeyZonesPipeline(args: {
  mode: MarketScopeLabel;
  micro: MicroContext | null;
  macro: MacroContext | null;
  spot: number | null;
  legacyFallback: KeyZoneViewModel[];
  useV2Enabled: boolean;
  stableHookOutput: KeyZoneViewModel[];
}): {
  payloadFields: FlipFieldAudit[];
  mapperMicro: KeyZonePipelineZone[];
  mapperMacro: KeyZonePipelineZone[];
  selector: KeyZonePipelineZone[];
  stableHook: KeyZonePipelineZone[];
  legacyFallback: KeyZonePipelineZone[];
  counts: {
    mapperMicro: number;
    mapperMacro: number;
    selector: number;
    stableHook: number;
    legacyFallback: number;
  };
  activePath: "v2" | "legacy" | "empty";
} {
  const mapperMicroZones = args.micro ? mapKeyZonesFromMicro(args.micro, args.spot) : [];
  const mapperMacroZones = args.macro ? mapKeyZonesFromMacro(args.macro, args.spot) : [];
  const selectorZones = selectKeyZonesForScope({
    mode: args.mode,
    micro: args.micro,
    macro: args.macro,
    spot: args.spot,
  });

  const activePath = args.useV2Enabled
    ? args.stableHookOutput.length > 0
      ? "v2"
      : "empty"
    : "legacy";

  return {
    payloadFields: auditFlipFields(args.micro, args.macro),
    mapperMicro: toPipelineZones(mapperMicroZones, "v2-micro-mapper", "Micro"),
    mapperMacro: toPipelineZones(mapperMacroZones, "v2-macro-mapper", "Macro"),
    selector: toPipelineZones(selectorZones, "v2-selector", args.mode),
    stableHook: toPipelineZones(args.stableHookOutput, "stable-hook", args.mode),
    legacyFallback: toPipelineZones(args.legacyFallback, "legacy-fallback", "legacy"),
    counts: {
      mapperMicro: mapperMicroZones.length,
      mapperMacro: mapperMacroZones.length,
      selector: selectorZones.length,
      stableHook: args.stableHookOutput.length,
      legacyFallback: args.legacyFallback.length,
    },
    activePath,
  };
}

/**
 * Simulates useStableKeyZones branch selection without React.
 */
export function resolveStableKeyZonesBranch(args: {
  enabled: boolean;
  mode: MarketScopeLabel;
  micro: MicroContext | null;
  macro: MacroContext | null;
  spot: number | null;
  fallbackZones: KeyZoneViewModel[];
  previousCache: KeyZoneViewModel[];
}): { branch: string; zones: KeyZoneViewModel[] } {
  if (!args.enabled) {
    return { branch: "legacy-fallback", zones: args.fallbackZones };
  }
  if (!args.micro || !args.macro) {
    return {
      branch: args.previousCache.length > 0 ? "stale-cache-while-v2-context-missing" : "empty",
      zones: args.previousCache,
    };
  }
  return {
    branch: "v2-selector",
    zones: selectKeyZonesForScope({
      mode: args.mode,
      micro: args.micro,
      macro: args.macro,
      spot: args.spot,
    }),
  };
}
