type ObjectProbe = {
  path: string;
  typeof: string;
  isNull: boolean;
  isUndefined: boolean;
  keys: string[] | null;
  hasGlobalFlip: boolean;
  hasLocalFlip: boolean;
  hasMicro: boolean;
  hasMacro: boolean;
};

function probe(path: string, value: unknown): ObjectProbe {
  const isNull = value === null;
  const isUndefined = value === undefined;
  const typeofValue = isNull ? "null" : typeof value;
  const keys =
    value != null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>)
      : null;

  const record = value != null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const market = record?.market as Record<string, unknown> | undefined;
  const levels = record?.levels as Record<string, unknown> | undefined;
  const nestedData = record?.data as Record<string, unknown> | undefined;
  const nestedMicro = nestedData?.micro;
  const nestedMacro = nestedData?.macro;

  return {
    path,
    typeof: typeofValue,
    isNull,
    isUndefined,
    keys,
    hasGlobalFlip: Boolean(market?.gammaFlip ?? record?.gammaFlip),
    hasLocalFlip: Boolean(levels?.dealerPivot ?? market?.dealerPivot),
    hasMicro: Boolean(record?.micro ?? nestedMicro),
    hasMacro: Boolean(record?.macro ?? nestedMacro),
  };
}

export type MarketStateDataSourceTrace = {
  marketStateSource: string;
  isV2MarketState: boolean;
  gammaEffectiveBranch: "v2" | "legacy";
  keyZonesEffectiveBranch: "v2" | "legacy";
  institutionalDataPath: string;
  gammaDataPath: string;
  keyZonesDataPath: string;
  auditInspectedPath: string;
  objectIdentity: {
    gammaVsKeyZones: boolean;
    institutionalVsKeyZones: boolean;
    legacyMarketVsV2Data: boolean;
    v2HookMicroVsNestedMicro: boolean;
    v2HookMacroVsNestedMacro: boolean;
  };
  probes: {
    legacyMarket: ObjectProbe;
    marketStateV2Hook: ObjectProbe;
    marketStateV2Data: ObjectProbe;
    marketStateV2Micro: ObjectProbe;
    marketStateV2Macro: ObjectProbe;
    institutionalFlipInputs: ObjectProbe;
    gammaV2Context: ObjectProbe;
    keyZonesContext: ObjectProbe;
  };
};

export function buildMarketStateDataSourceTrace(input: {
  marketStateSource: string;
  isV2MarketState: boolean;
  marketScope: "Macro" | "Micro";
  legacyMarket: unknown;
  marketStateV2Hook: unknown;
  marketStateV2Data: unknown;
  marketStateV2Micro: unknown;
  marketStateV2Macro: unknown;
  institutionalFlipInputs: unknown;
  gammaUsesV2: boolean;
  keyZonesUsesV2: boolean;
}): MarketStateDataSourceTrace {
  const nestedMicro = (input.marketStateV2Data as { data?: { micro?: unknown } } | null)?.data?.micro ?? null;
  const nestedMacro = (input.marketStateV2Data as { data?: { macro?: unknown } } | null)?.data?.macro ?? null;

  const gammaV2Context =
    input.marketScope === "Micro" ? input.marketStateV2Micro : input.marketStateV2Macro;
  const gammaObject = input.gammaUsesV2 ? gammaV2Context : input.legacyMarket;
  const keyZonesObject = input.keyZonesUsesV2
    ? { micro: input.marketStateV2Micro, macro: input.marketStateV2Macro }
    : input.legacyMarket;

  return {
    marketStateSource: input.marketStateSource,
    isV2MarketState: input.isV2MarketState,
    gammaEffectiveBranch: input.gammaUsesV2 ? "v2" : "legacy",
    keyZonesEffectiveBranch: input.keyZonesUsesV2 ? "v2" : "legacy",
    institutionalDataPath: "legacyMarketQuery.data → raw",
    gammaDataPath: input.gammaUsesV2
      ? `marketStateV2.${input.marketScope === "Micro" ? "micro" : "macro"} (via v2UiMappers)`
      : "legacyMarketQuery.data → raw (gammaRegime, gammaFlip, totalGex, …)",
    keyZonesDataPath: input.keyZonesUsesV2
      ? "marketStateV2.micro + marketStateV2.macro → useStableKeyZones → v2UiMappers"
      : "legacyMarketQuery.data → raw.levels (callWall, putWall only)",
    auditInspectedPath: "marketStateV2 hook fields (data, micro, macro, hasSnapshot)",
    objectIdentity: {
      gammaVsKeyZones: Object.is(gammaObject, keyZonesObject),
      institutionalVsKeyZones: Object.is(input.institutionalFlipInputs, keyZonesObject),
      legacyMarketVsV2Data: Object.is(input.legacyMarket, input.marketStateV2Data),
      v2HookMicroVsNestedMicro: Object.is(input.marketStateV2Micro, nestedMicro),
      v2HookMacroVsNestedMacro: Object.is(input.marketStateV2Macro, nestedMacro),
    },
    probes: {
      legacyMarket: probe("legacyMarketQuery.data", input.legacyMarket),
      marketStateV2Hook: probe("marketStateV2 (hook return)", input.marketStateV2Hook),
      marketStateV2Data: probe("marketStateV2.data", input.marketStateV2Data),
      marketStateV2Micro: probe("marketStateV2.micro", input.marketStateV2Micro),
      marketStateV2Macro: probe("marketStateV2.macro", input.marketStateV2Macro),
      institutionalFlipInputs: probe("institutional inputs (raw)", input.institutionalFlipInputs),
      gammaV2Context: probe(
        `gamma v2 context (${input.marketScope})`,
        input.gammaUsesV2 ? gammaV2Context : null,
      ),
      keyZonesContext: probe(
        "useStableKeyZones context",
        input.keyZonesUsesV2
          ? { micro: input.marketStateV2Micro, macro: input.marketStateV2Macro }
          : input.legacyMarket,
      ),
    },
  };
}

export function logMarketStateDataSourceTrace(trace: MarketStateDataSourceTrace): void {
  if (!__DEV__) return;
  console.log("===== Market State Data Source Trace =====");
  console.log("marketStateSource:", trace.marketStateSource);
  console.log("isV2MarketState:", trace.isV2MarketState);
  console.log("gammaEffectiveBranch:", trace.gammaEffectiveBranch);
  console.log("keyZonesEffectiveBranch:", trace.keyZonesEffectiveBranch);
  console.log("institutionalDataPath:", trace.institutionalDataPath);
  console.log("gammaDataPath:", trace.gammaDataPath);
  console.log("keyZonesDataPath:", trace.keyZonesDataPath);
  console.log("auditInspectedPath:", trace.auditInspectedPath);
  console.log("Object.is(gammaObject, keyZonesObject):", trace.objectIdentity.gammaVsKeyZones);
  console.log(
    "Object.is(institutionalFlipInputs, keyZonesObject):",
    trace.objectIdentity.institutionalVsKeyZones,
  );
  console.log(
    "Object.is(legacyMarket, marketStateV2.data):",
    trace.objectIdentity.legacyMarketVsV2Data,
  );
  console.log(
    "Object.is(marketStateV2.micro, marketStateV2.data.data.micro):",
    trace.objectIdentity.v2HookMicroVsNestedMicro,
  );
  console.log(
    "Object.is(marketStateV2.macro, marketStateV2.data.data.macro):",
    trace.objectIdentity.v2HookMacroVsNestedMacro,
  );
  console.log("probes:", JSON.stringify(trace.probes, null, 2));
  console.log("==========================================");
}
