import type { DataStatus } from "@/shared/mobileMarketStateV2.contract";

type PayloadRecord = Record<string, unknown>;

type ValuedField<T> = {
  value: T | null;
  status: DataStatus;
};

function isRecord(value: unknown): value is PayloadRecord {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function asDataStatus(value: unknown, fallback: DataStatus = "unavailable"): DataStatus {
  const allowed: DataStatus[] = [
    "available",
    "unavailable",
    "stale",
    "not_applicable",
    "calculation_error",
  ];
  return typeof value === "string" && allowed.includes(value as DataStatus)
    ? (value as DataStatus)
    : fallback;
}

function readValuedField<T>(value: unknown): ValuedField<T> | null {
  if (!isRecord(value)) return null;
  if (!("status" in value)) return null;
  return {
    value: ("value" in value ? (value.value as T | null) : null) ?? null,
    status: asDataStatus(value.status),
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function valuedFromPrice(level: unknown): ValuedField<number> {
  if (!isRecord(level)) {
    return { value: null, status: "unavailable" };
  }

  const nestedPrice = readValuedField<number>(level.price);
  if (nestedPrice) return nestedPrice;

  const flatPrice = readNumber(level.price);
  const status = asDataStatus(level.status, flatPrice == null ? "unavailable" : "available");
  return { value: flatPrice, status };
}

function distanceFromFlip(flip: unknown): {
  signedDistanceUsd: number | null;
  distanceUsd: number | null;
  signedDistancePct: number | null;
  distancePct: number | null;
  position: "above_spot" | "below_spot" | "at_spot" | null;
  status: DataStatus;
} {
  const distance = isRecord(flip) ? flip.distance : null;
  if (!isRecord(distance)) {
    return {
      signedDistanceUsd: null,
      distanceUsd: null,
      signedDistancePct: null,
      distancePct: null,
      position: null,
      status: "unavailable",
    };
  }

  return {
    signedDistanceUsd: readNumber(distance.signedDistanceUsd),
    distanceUsd: readNumber(distance.distanceUsd),
    signedDistancePct: readNumber(distance.signedDistancePct),
    distancePct: readNumber(distance.distancePct),
    position:
      distance.position === "above_spot" ||
      distance.position === "below_spot" ||
      distance.position === "at_spot"
        ? distance.position
        : null,
    status: asDataStatus(distance.status, "available"),
  };
}

function distanceFromLevel(level: unknown): ReturnType<typeof distanceFromFlip> {
  const distance = isRecord(level) ? level.distance : null;
  if (!isRecord(distance)) {
    return {
      signedDistanceUsd: null,
      distanceUsd: null,
      signedDistancePct: null,
      distancePct: null,
      position: null,
      status: "unavailable",
    };
  }
  return distanceFromFlip({ distance });
}

function formatTransitionZone(transitionZone: unknown): ValuedField<string> {
  if (!isRecord(transitionZone)) {
    return { value: null, status: "unavailable" };
  }

  const start = readValuedField<number>(transitionZone.start);
  const end = readValuedField<number>(transitionZone.end);
  const status =
    start?.status === "available" || end?.status === "available"
      ? "available"
      : asDataStatus(transitionZone.status, "unavailable");

  if (start?.value != null && end?.value != null) {
    return { value: `${Math.round(start.value)}-${Math.round(end.value)}`, status };
  }
  if (start?.value != null) {
    return { value: String(Math.round(start.value)), status };
  }
  return { value: null, status };
}

function normalizeRegimeLabel(value: string | null): string | null {
  if (value == null) return null;
  return value.replace(/_/g, " ").trim();
}

type MappedZoneItem = {
  price: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  label: string | null;
  active: boolean | null;
  isActive: boolean | null;
  status: DataStatus;
};

function zoneItemIdentityFromRaw(item: PayloadRecord): string {
  const id = readString(item.id);
  if (id) return id.toLowerCase();
  const label = readString(item.label) ?? readString(item.name) ?? "";
  const priceField = readValuedField<number>(item.price);
  const price = priceField?.value ?? readNumber(item.price);
  return `${label.toLowerCase()}|${price ?? "na"}`;
}

function isPocketItem(item: PayloadRecord): boolean {
  const type = (readString(item.type) ?? "").toLowerCase();
  return type.includes("pocket");
}

function containerItems(primary: unknown, secondary: unknown): PayloadRecord[] {
  const from = (container: unknown): PayloadRecord[] => {
    if (!isRecord(container)) return [];
    return Array.isArray(container.items) ? container.items.filter(isRecord) : [];
  };

  const seen = new Set<string>();
  const merged: PayloadRecord[] = [];
  for (const item of [...from(primary), ...from(secondary)]) {
    const identity = zoneItemIdentityFromRaw(item);
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(item);
  }
  return merged;
}

function mapZoneItem(item: PayloadRecord): MappedZoneItem {
  const priceField = readValuedField<number>(item.price);
  const price = priceField?.value ?? readNumber(item.price);
  const status = asDataStatus(item.status, priceField?.status ?? "available");
  const label = readString(item.label) ?? readString(item.name) ?? readString(item.id);
  return {
    price,
    priceLow: readNumber(item.priceLow),
    priceHigh: readNumber(item.priceHigh),
    label,
    active: typeof item.active === "boolean" ? item.active : null,
    isActive: typeof item.isActive === "boolean" ? item.isActive : null,
    status,
  };
}

function mapZoneItems(
  primary: unknown,
  secondary: unknown,
  options?: { excludeIdentities?: Set<string>; excludePocketTypes?: boolean },
): MappedZoneItem[] {
  const mapped: MappedZoneItem[] = [];
  const seen = new Set<string>();

  for (const item of containerItems(primary, secondary)) {
    const identity = zoneItemIdentityFromRaw(item);
    if (options?.excludeIdentities?.has(identity)) continue;
    if (options?.excludePocketTypes && isPocketItem(item)) continue;
    if (seen.has(identity)) continue;
    seen.add(identity);
    mapped.push(mapZoneItem(item));
  }

  return mapped;
}

function mapMagnets(container: unknown): MappedZoneItem[] {
  if (!isRecord(container)) return [];
  const items = Array.isArray(container.items) ? container.items : Array.isArray(container) ? container : [];
  const containerStatus = asDataStatus(container.status, "available");

  return items
    .map((item) => {
      if (!isRecord(item)) return null;
      const mapped = mapZoneItem(item);
      return {
        ...mapped,
        status: asDataStatus(item.status, mapped.status ?? containerStatus),
      };
    })
    .filter((item): item is MappedZoneItem => item != null);
}

function mapScenarioItem(item: unknown): {
  code: string | null;
  title: string | null;
  thesis: string | null;
  status: DataStatus;
  probability: number | null;
} {
  if (!isRecord(item)) {
    return { code: null, title: null, thesis: null, status: "unavailable", probability: null };
  }

  const code =
    readString(item.code) ??
    readString(item.type) ??
    readValuedField<string>(item.code)?.value ??
    null;
  const title = readValuedField<string>(item.title)?.value ?? readString(item.title);
  const thesis = readValuedField<string>(item.thesis)?.value ?? readString(item.thesis);
  const status = asDataStatus(item.status, "available");
  const probability = readNumber(item.probability);

  return { code, title, thesis, status, probability };
}

function mapDominantExpiry(block: unknown): {
  date: string | null;
  instrumentCode: string | null;
  daysToExpiry: number | null;
  status: DataStatus;
} {
  if (!isRecord(block)) {
    return { date: null, instrumentCode: null, daysToExpiry: null, status: "unavailable" };
  }

  return {
    date: readString(block.date),
    instrumentCode: readString(block.instrumentCode),
    daysToExpiry: readNumber(block.daysToExpiry),
    status: asDataStatus(block.status, "unavailable"),
  };
}

function mapTerminalMicro(scope: PayloadRecord): PayloadRecord {
  const gamma = isRecord(scope.gamma) ? scope.gamma : {};
  const optionsStructure = isRecord(scope.optionsStructure) ? scope.optionsStructure : {};
  const bias = isRecord(scope.bias) ? scope.bias : {};
  const risk = isRecord(scope.risk) ? scope.risk : {};
  const scenarios = isRecord(scope.scenarios) ? scope.scenarios : {};

  const flip = gamma.flip;
  const localGammaFlip = isRecord(flip) ? readValuedField<number>(flip.price) ?? { value: null, status: "unavailable" } : { value: null, status: "unavailable" };

  const regime = readValuedField<string>(gamma.regime);
  const localRegime: ValuedField<string> = regime
    ? { value: normalizeRegimeLabel(regime.value), status: regime.status }
    : { value: null, status: "unavailable" };

  const volatility = isRecord(risk.volatility) ? readValuedField<string>(risk.volatility.state) : null;
  const squeeze = isRecord(risk.squeeze) ? readValuedField<string>(risk.squeeze.level) : null;
  const intradayRisk: ValuedField<string> = volatility ??
    squeeze ?? { value: null, status: "unavailable" };

  const biasLabel = readValuedField<string>(bias.label);
  const intradayBias: ValuedField<string> = biasLabel
    ? { value: normalizeRegimeLabel(biasLabel.value), status: biasLabel.status }
    : { value: null, status: "unavailable" };

  const scenarioItems = Array.isArray(scenarios.items) ? scenarios.items : [];
  const baseItem =
    scenarioItems.find((item) => isRecord(item) && (item.type === "base" || item.classification === "intraday")) ??
    scenarioItems[0] ??
    null;

  const pockets = mapZoneItems(gamma.shortGammaPockets, optionsStructure.shortGammaPockets);
  const pocketIdentities = new Set(
    containerItems(gamma.shortGammaPockets, optionsStructure.shortGammaPockets).map(zoneItemIdentityFromRaw),
  );
  const magnets = mapZoneItems(gamma.gammaMagnets, optionsStructure.gammaMagnets, {
    excludeIdentities: pocketIdentities,
    excludePocketTypes: true,
  });

  return {
    localGammaFlip,
    distanceToLocalFlip: distanceFromFlip(flip),
    localRegime,
    localTransitionZone: formatTransitionZone(gamma.transitionZone),
    nearbyMagnets: magnets,
    nearbyPockets: pockets,
    intradayRisk,
    intradayBias,
    baseIntradayScenario: mapScenarioItem(baseItem),
    totalGex: readValuedField<number>(gamma.totalGex) ?? { value: null, status: "not_applicable" },
  };
}

function mapTerminalMacro(scope: PayloadRecord): PayloadRecord {
  const gamma = isRecord(scope.gamma) ? scope.gamma : {};
  const optionsStructure = isRecord(scope.optionsStructure) ? scope.optionsStructure : {};
  const scenarios = isRecord(scope.scenarios) ? scope.scenarios : {};

  const flip = gamma.flip;
  const globalGammaFlip = isRecord(flip)
    ? readValuedField<number>(flip.price) ?? { value: null, status: "unavailable" }
    : { value: null, status: "unavailable" };

  const regime = readValuedField<string>(gamma.regime);
  const globalRegime: ValuedField<string> = regime
    ? { value: normalizeRegimeLabel(regime.value), status: regime.status }
    : { value: null, status: "unavailable" };

  const scenarioItems = Array.isArray(scenarios.items) ? scenarios.items : [];
  const structuralScenarios = scenarioItems
    .filter((item) => isRecord(item) && item.type !== "tail" && item.classification !== "tail")
    .map(mapScenarioItem);
  const tailScenarios = scenarioItems
    .filter((item) => isRecord(item) && (item.type === "tail" || item.classification === "tail"))
    .map(mapScenarioItem);

  const dealerPivotLevel = gamma.dealerPivot ?? optionsStructure.dealerPivot;
  const pockets = mapZoneItems(gamma.shortGammaPockets, optionsStructure.shortGammaPockets);
  const pocketIdentities = new Set(
    containerItems(gamma.shortGammaPockets, optionsStructure.shortGammaPockets).map(zoneItemIdentityFromRaw),
  );
  const magnets = mapZoneItems(gamma.gammaMagnets, optionsStructure.gammaMagnets, {
    excludeIdentities: pocketIdentities,
    excludePocketTypes: true,
  });

  return {
    globalGammaFlip,
    totalGex: readValuedField<number>(gamma.totalGex) ?? { value: null, status: "not_applicable" },
    globalRegime,
    callWall: valuedFromPrice(optionsStructure.callWall),
    putWall: valuedFromPrice(optionsStructure.putWall),
    dealerPivot: valuedFromPrice(dealerPivotLevel),
    dominantExpiry: mapDominantExpiry(gamma.dominantExpiry ?? optionsStructure.dominantExpiry),
    structuralMagnets: magnets,
    shortGammaPockets: pockets,
    structuralScenarios,
    tailScenarios,
  };
}

function normalizeRelationshipCode(value: string | null): string | null {
  if (value == null) return null;
  return value.replace(/-/g, "_").toUpperCase();
}

function mapTerminalRelationship(relationship: unknown): unknown {
  if (!isRecord(relationship)) return relationship;

  const descriptionCode = readValuedField<string>(relationship.descriptionCode);
  return {
    regimeAlignment: readValuedField<string>(relationship.regimeAlignment) ?? {
      value: null,
      status: "unavailable",
    },
    flipOrdering: readValuedField<string>(relationship.flipOrdering) ?? {
      value: null,
      status: "unavailable",
    },
    conflictLevel: readValuedField<string>(relationship.conflictLevel) ?? {
      value: null,
      status: "unavailable",
    },
    biasAlignment: readValuedField<string>(relationship.biasAlignment) ?? {
      value: null,
      status: "unavailable",
    },
    tradeImplication: readValuedField<string>(relationship.tradeImplication) ?? {
      value: null,
      status: "unavailable",
    },
    descriptionCode: descriptionCode
      ? {
          value: normalizeRelationshipCode(descriptionCode.value),
          status: descriptionCode.status,
        }
      : { value: null, status: "unavailable" },
  };
}

export function isTerminalMarketStatePayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const micro = payload.micro;
  if (!isRecord(micro)) return false;
  if ("localGammaFlip" in micro || "globalGammaFlip" in micro) return false;
  return "gamma" in micro || "optionsStructure" in micro || "marketState" in micro;
}

export function mapTerminalPayloadToMobileV2(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  if (!isTerminalMarketStatePayload(payload)) return payload;

  const micro = isRecord(payload.micro) ? payload.micro : {};
  const macro = isRecord(payload.macro) ? payload.macro : {};

  return {
    ...payload,
    micro: mapTerminalMicro(micro),
    macro: mapTerminalMacro(macro),
    relationship: mapTerminalRelationship(payload.relationship),
  };
}

export const __testOnlyMapTerminalMicro = mapTerminalMicro;
export const __testOnlyMapTerminalMacro = mapTerminalMacro;
