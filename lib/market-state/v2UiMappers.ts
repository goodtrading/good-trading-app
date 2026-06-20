import type { DataStatus, DistanceMetrics, SpotPosition } from "@/shared/mobileMarketStateV2.contract";

import {
  formatValuedField,
  isStaleMetric,
  shouldHideMetric,
} from "./dataStatusUi";
import type { MacroContext, MicroContext, Relationship } from "./v2DataSchema";

export type GammaCardViewModel = {
  state: string;
  level: number;
  netGamma: string;
  flipPoint: string;
  description: string;
  dominantExpiry: string;
  netGammaStale: boolean;
  flipPointStale: boolean;
  hideNetGamma: boolean;
};

export type KeyZoneDetailItem = {
  id: string;
  label: string;
  price: string;
  distance?: string;
  stale?: boolean;
};

export type KeyZoneGroupType =
  | "single"
  | "structural_magnet"
  | "nearby_magnet"
  | "short_gamma_pocket"
  | "nearby_pocket"
  | "structural_scenario"
  | "tail_scenario"
  | "intraday_scenario"
  | "transition_zone"
  | "dominant_expiry";

export type KeyZoneViewModel = {
  id: string;
  groupType: KeyZoneGroupType;
  label: string;
  price: string;
  type: "resistance" | "support" | "current" | "neutral";
  distance: string;
  barColor?: string;
  stale?: boolean;
  modalTitle?: string;
  items?: KeyZoneDetailItem[];
  moreCount?: number;
};

/** Contextual flip labels — never use "Gamma Flip" in UI. */
export const KEY_ZONE_LABEL_LOCAL_FLIP = "Local Flip";
export const KEY_ZONE_LABEL_GLOBAL_FLIP = "Global Flip";

export const KEY_ZONE_GROUP_STRUCTURAL_MAGNET = "Structural Magnet";
export const KEY_ZONE_GROUP_NEARBY_MAGNET = "Nearby Magnet";
export const KEY_ZONE_GROUP_SHORT_GAMMA_POCKET = "Short Gamma Pocket";
export const KEY_ZONE_GROUP_STRUCTURAL_SCENARIO = "Structural Scenario";
export const KEY_ZONE_GROUP_TAIL_SCENARIO = "Tail Scenario";
export const KEY_ZONE_GROUP_INTRADAY_SCENARIO = "Intraday Scenario";

const formatUsd = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatUsdPlain = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 0 });

type PocketLike = {
  price: number | null;
  priceLow?: number | null;
  priceHigh?: number | null;
  label: string | null;
  status: DataStatus;
  active?: boolean;
  isActive?: boolean;
};

type MagnetLike = {
  price: number | null;
  label: string | null;
  status: DataStatus;
};

type ScenarioLike = {
  code: string | null;
  title: string | null;
  thesis: string | null;
  status: DataStatus;
  probability?: number | null;
};

function spotDistance(price: number | null, spot: number | null): number {
  if (price == null || spot == null || !Number.isFinite(price) || !Number.isFinite(spot)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(price - spot);
}

function pocketAnchorDistance(pocket: PocketLike, spot: number | null): number {
  if (spot == null) return Number.POSITIVE_INFINITY;
  if (pocket.price != null) return spotDistance(pocket.price, spot);
  if (pocket.priceLow != null && pocket.priceHigh != null) {
    const midpoint = (pocket.priceLow + pocket.priceHigh) / 2;
    return spotDistance(midpoint, spot);
  }
  if (pocket.priceLow != null) return spotDistance(pocket.priceLow, spot);
  if (pocket.priceHigh != null) return spotDistance(pocket.priceHigh, spot);
  return Number.POSITIVE_INFINITY;
}

function isPocketActive(pocket: PocketLike): boolean {
  return pocket.active === true || pocket.isActive === true;
}

function sortMagnetsBySpotProximity(magnets: MagnetLike[], spot: number | null): MagnetLike[] {
  return [...magnets].sort(
    (left, right) => spotDistance(left.price, spot) - spotDistance(right.price, spot),
  );
}

function sortPocketsByPriority(pockets: PocketLike[], spot: number | null): PocketLike[] {
  return [...pockets].sort((left, right) => {
    const leftActive = isPocketActive(left);
    const rightActive = isPocketActive(right);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return pocketAnchorDistance(left, spot) - pocketAnchorDistance(right, spot);
  });
}

function sortScenariosByProbability(scenarios: ScenarioLike[]): ScenarioLike[] {
  return [...scenarios].sort((left, right) => {
    const leftProbability = left.probability ?? -1;
    const rightProbability = right.probability ?? -1;
    return rightProbability - leftProbability;
  });
}

function distancePctForLevel(spot: number | null, value: number | null): string {
  if (spot == null || value == null || !Number.isFinite(value)) return "—";
  return formatSignedPct(((value - spot) / spot) * 100);
}

function distancePctForPocket(spot: number | null, pocket: PocketLike): string {
  const anchor = pocket.price ?? pocket.priceHigh ?? pocket.priceLow;
  return distancePctForLevel(spot, anchor);
}

function formatPocketPrice(pocket: PocketLike): string | null {
  if (shouldHideMetric(pocket.status)) return null;
  if (pocket.priceLow != null && pocket.priceHigh != null) {
    return `${formatUsdPlain(pocket.priceLow)} - ${formatUsdPlain(pocket.priceHigh)}`;
  }
  return formatValuedField(pocket.status, pocket.price, formatUsd);
}

function humanizePocketLabel(label: string | null, index: number): string {
  if (!label) return `Pocket ${index + 1}`;
  const lower = label.toLowerCase();
  if (lower.includes("upper")) return "Upper Pocket";
  if (lower.includes("lower")) return "Lower Pocket";
  return label
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildGroupedZone(args: {
  id: string;
  groupType: KeyZoneGroupType;
  label: string;
  modalTitle: string;
  type: KeyZoneViewModel["type"];
  items: KeyZoneDetailItem[];
  barColor?: string;
}): KeyZoneViewModel | null {
  if (args.items.length === 0) return null;
  const primary = args.items[0];
  const moreCount = Math.max(0, args.items.length - 1);
  return {
    id: args.id,
    groupType: args.groupType,
    label: args.label,
    modalTitle: args.modalTitle,
    price: primary.price,
    type: args.type,
    distance: primary.distance ?? "—",
    barColor: args.barColor,
    stale: args.items.some((item) => item.stale),
    items: args.items,
    moreCount,
  };
}

function mapMagnetDetailItems(
  magnets: MagnetLike[],
  spot: number | null,
  groupId: string,
  numberedLabels: boolean,
): KeyZoneDetailItem[] {
  const sorted = sortMagnetsBySpotProximity(magnets, spot);
  const items: KeyZoneDetailItem[] = [];

  for (const [index, magnet] of sorted.entries()) {
    if (shouldHideMetric(magnet.status)) continue;
    const price = formatValuedField(magnet.status, magnet.price, formatUsd);
    if (!price) continue;
    items.push({
      id: `${groupId}-magnet-${index}`,
      label: numberedLabels
        ? `#${index + 1}`
        : (magnet.label?.toUpperCase() ?? `#${index + 1}`),
      price,
      distance: distancePctForLevel(spot, magnet.price),
      stale: isStaleMetric(magnet.status),
    });
  }

  return items;
}

function mapPocketDetailItems(
  pockets: PocketLike[],
  spot: number | null,
  groupId: string,
): KeyZoneDetailItem[] {
  const sorted = sortPocketsByPriority(pockets, spot);
  const items: KeyZoneDetailItem[] = [];

  for (const [index, pocket] of sorted.entries()) {
    const price = formatPocketPrice(pocket);
    if (!price) continue;
    items.push({
      id: `${groupId}-pocket-${index}`,
      label: humanizePocketLabel(pocket.label, index),
      price,
      distance: distancePctForPocket(spot, pocket),
      stale: isStaleMetric(pocket.status),
    });
  }

  return items;
}

function mapScenarioDetailItems(
  scenarios: ScenarioLike[],
  groupId: string,
): KeyZoneDetailItem[] {
  const sorted = sortScenariosByProbability(scenarios);
  const items: KeyZoneDetailItem[] = [];

  for (const [index, scenario] of sorted.entries()) {
    if (shouldHideMetric(scenario.status)) continue;
    const title = scenario.title ?? scenario.code;
    if (!title) continue;
    items.push({
      id: `${groupId}-scenario-${index}`,
      label: title,
      price: scenario.thesis ?? "—",
      stale: isStaleMetric(scenario.status),
    });
  }

  return items;
}

export function logKeyZoneGroups(zones: KeyZoneViewModel[]): void {
  if (!__DEV__) return;
  console.log(
    "[KEYZONE GROUPS]",
    zones
      .filter((zone) => zone.items != null && zone.items.length > 0)
      .map((zone) => ({
        groupType: zone.groupType,
        itemCount: zone.items?.length ?? 0,
        primaryItem: zone.items?.[0]
          ? { id: zone.items[0].id, label: zone.items[0].label, price: zone.items[0].price }
          : null,
        moreCount: zone.moreCount ?? 0,
      })),
  );
}

export function isKeyZoneExpandable(zone: KeyZoneViewModel): boolean {
  return (zone.moreCount ?? 0) > 0;
}

export function keyZoneMoreLabel(zone: KeyZoneViewModel): string | null {
  const count = zone.moreCount ?? 0;
  return count > 0 ? `+${count} más` : null;
}

const formatCompactUsd = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const formatSignedPct = (value: number | null) => {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

function normalizeRegimeState(regime: string | null): string {
  const text = String(regime ?? "").toUpperCase();
  if (text.includes("SHORT")) return "SHORT";
  if (text.includes("LONG")) return "LONG";
  if (text.includes("TRANSITION")) return "TRANSITION";
  return "UNKNOWN";
}

function levelFromDistancePct(status: DataStatus, signedDistancePct: number | null): number {
  if (shouldHideMetric(status)) return 0;
  if (signedDistancePct == null || !Number.isFinite(signedDistancePct)) return 0;
  const magnitude = Math.min(100, Math.max(0, Math.round(Math.abs(signedDistancePct) * 10)));
  return signedDistancePct < 0 ? -magnitude : magnitude;
}

function levelFromTotalGex(status: DataStatus, value: number | null): number {
  if (shouldHideMetric(status) || value == null || !Number.isFinite(value)) return 0;
  const magnitude = Math.min(100, Math.round(Math.log10(Math.abs(value) + 1) * 8));
  return value < 0 ? -magnitude : magnitude;
}

function formatLevelField(
  status: DataStatus,
  value: number | null,
  formatter: (n: number) => string,
): { text: string; stale: boolean; hidden: boolean } {
  if (shouldHideMetric(status)) {
    return { text: "", stale: false, hidden: true };
  }
  const text = formatValuedField(status, value, formatter) ?? "No disponible";
  return { text, stale: isStaleMetric(status), hidden: false };
}

function formatDominantExpiry(block: MacroContext["dominantExpiry"]): string {
  if (shouldHideMetric(block.status)) return "";
  if (block.status === "unavailable" || block.status === "calculation_error") {
    return "No disponible";
  }
  if (block.instrumentCode) return block.instrumentCode;
  if (block.date) return block.date;
  return "No disponible";
}

export function mapRelationshipDescription(relationship: Relationship | null): string {
  if (!relationship) return "";

  const code = relationship.descriptionCode.value;
  const status = relationship.descriptionCode.status;
  if (shouldHideMetric(status) || code == null) return "";

  switch (code) {
    case "REGIME_ALIGNED":
      return "Contextos alineados.";
    case "REGIME_DIVERGENT":
      return "Conflicto entre estructura local y global.";
    case "LOCAL_ABOVE_GLOBAL":
      return "Micro por encima de macro — vigilar reversión.";
    case "LOCAL_BELOW_GLOBAL":
      return "Micro frágil dentro de macro estable.";
    case "CONTEXT_CONFLICT_WAIT":
      return "Esperar confirmación.";
    case "TREND_CONTINUATION_LIKELY":
      return "Continuación favorecida.";
    default:
      return "";
  }
}

export function mapGammaCardFromMicro(micro: MicroContext, relationship: Relationship | null): GammaCardViewModel {
  const regime = micro.localRegime.value;
  const flip = formatLevelField(micro.localGammaFlip.status, micro.localGammaFlip.value, formatUsd);
  const netGammaHidden = shouldHideMetric(micro.totalGex.status);

  return {
    state: normalizeRegimeState(regime),
    level: levelFromDistancePct(
      micro.distanceToLocalFlip.status,
      micro.distanceToLocalFlip.signedDistancePct,
    ),
    netGamma: netGammaHidden
      ? ""
      : formatValuedField(micro.totalGex.status, micro.totalGex.value, formatCompactUsd) ?? "No disponible",
    flipPoint: flip.hidden ? "" : flip.text,
    description: mapRelationshipDescription(relationship),
    dominantExpiry: "",
    netGammaStale: isStaleMetric(micro.totalGex.status),
    flipPointStale: flip.stale,
    hideNetGamma: netGammaHidden,
  };
}

export function mapGammaCardFromMacro(macro: MacroContext, relationship: Relationship | null): GammaCardViewModel {
  const regime = macro.globalRegime.value;
  const flip = formatLevelField(macro.globalGammaFlip.status, macro.globalGammaFlip.value, formatUsd);
  const netGamma = formatLevelField(macro.totalGex.status, macro.totalGex.value, formatCompactUsd);
  const expiry = formatDominantExpiry(macro.dominantExpiry);

  return {
    state: normalizeRegimeState(regime),
    level: levelFromTotalGex(macro.totalGex.status, macro.totalGex.value),
    netGamma: netGamma.hidden ? "No disponible" : netGamma.text,
    flipPoint: flip.hidden ? "No disponible" : flip.text,
    description: mapRelationshipDescription(relationship),
    dominantExpiry: expiry || "No disponible",
    netGammaStale: netGamma.stale,
    flipPointStale: flip.stale,
    hideNetGamma: false,
  };
}

function zoneTypeFromPosition(position: string | null): KeyZoneViewModel["type"] {
  if (position === "above_spot") return "resistance";
  if (position === "below_spot") return "support";
  return "neutral";
}

function isDegradedMetric(status: DataStatus): boolean {
  return status === "calculation_error";
}

function levelZone(
  id: string,
  label: string,
  status: DataStatus,
  value: number | null,
  distance: Pick<DistanceMetrics, "signedDistancePct" | "status" | "position">,
  barColor?: string,
): KeyZoneViewModel | null {
  if (shouldHideMetric(status)) return null;

  const price = formatValuedField(status, value, formatUsd);
  if (price == null) return null;

  return {
    id,
    groupType: "single",
    label,
    price,
    type: zoneTypeFromPosition(distance.position),
    distance: formatSignedPct(distance.signedDistancePct),
    barColor,
    stale: isStaleMetric(status) || isStaleMetric(distance.status) || isDegradedMetric(status),
    moreCount: 0,
  };
}

export function mapKeyZonesFromMicro(micro: MicroContext, spot: number | null): KeyZoneViewModel[] {
  const zones: KeyZoneViewModel[] = [];

  const localFlip = levelZone(
    "local-flip",
    KEY_ZONE_LABEL_LOCAL_FLIP,
    micro.localGammaFlip.status,
    micro.localGammaFlip.value,
    micro.distanceToLocalFlip,
    "#a9fbdd",
  );
  if (localFlip) zones.push(localFlip);

  const magnetGroup = buildGroupedZone({
    id: "nearby-magnets",
    groupType: "nearby_magnet",
    label: KEY_ZONE_GROUP_NEARBY_MAGNET,
    modalTitle: "NEARBY MAGNETS",
    type: "neutral",
    items: mapMagnetDetailItems(micro.nearbyMagnets, spot, "nearby-magnets", true),
  });
  if (magnetGroup) zones.push(magnetGroup);

  const pocketGroup = buildGroupedZone({
    id: "nearby-pockets",
    groupType: "nearby_pocket",
    label: KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    modalTitle: "SHORT GAMMA POCKETS",
    type: "resistance",
    items: mapPocketDetailItems(micro.nearbyPockets, spot, "nearby-pockets"),
  });
  if (pocketGroup) zones.push(pocketGroup);

  return zones;
}

export function mapKeyZonesFromMacro(macro: MacroContext, spot: number | null): KeyZoneViewModel[] {
  const zones: KeyZoneViewModel[] = [];
  const distanceFor = (value: number | null): Pick<DistanceMetrics, "signedDistancePct" | "status" | "position"> => ({
    signedDistancePct: spot != null && value != null ? ((value - spot) / spot) * 100 : null,
    status: "available",
    position:
      spot != null && value != null
        ? ((value > spot ? "above_spot" : value < spot ? "below_spot" : "at_spot") as SpotPosition)
        : null,
  });

  const globalFlip = levelZone(
    "global-flip",
    KEY_ZONE_LABEL_GLOBAL_FLIP,
    macro.globalGammaFlip.status,
    macro.globalGammaFlip.value,
    {
      signedDistancePct: distanceFor(macro.globalGammaFlip.value).signedDistancePct,
      position: distanceFor(macro.globalGammaFlip.value).position,
      status: macro.globalGammaFlip.status,
    },
    "#c4b4fd",
  );
  if (globalFlip) zones.push(globalFlip);

  const callWall = levelZone(
    "call-wall",
    "CALL WALL",
    macro.callWall.status,
    macro.callWall.value,
    { ...distanceFor(macro.callWall.value), status: macro.callWall.status },
  );
  if (callWall) zones.push(callWall);

  const putWall = levelZone(
    "put-wall",
    "PUT WALL",
    macro.putWall.status,
    macro.putWall.value,
    { ...distanceFor(macro.putWall.value), status: macro.putWall.status },
  );
  if (putWall) zones.push(putWall);

  const dealerPivot = levelZone(
    "dealer-pivot",
    "DEALER PIVOT",
    macro.dealerPivot.status,
    macro.dealerPivot.value,
    { ...distanceFor(macro.dealerPivot.value), status: macro.dealerPivot.status },
  );
  if (dealerPivot) zones.push(dealerPivot);

  const magnetGroup = buildGroupedZone({
    id: "structural-magnets",
    groupType: "structural_magnet",
    label: KEY_ZONE_GROUP_STRUCTURAL_MAGNET,
    modalTitle: "STRUCTURAL MAGNETS",
    type: "neutral",
    items: mapMagnetDetailItems(macro.structuralMagnets, spot, "structural-magnets", true),
  });
  if (magnetGroup) zones.push(magnetGroup);

  const pocketGroup = buildGroupedZone({
    id: "short-gamma-pockets",
    groupType: "short_gamma_pocket",
    label: KEY_ZONE_GROUP_SHORT_GAMMA_POCKET,
    modalTitle: "SHORT GAMMA POCKETS",
    type: "resistance",
    items: mapPocketDetailItems(macro.shortGammaPockets, spot, "short-gamma-pockets"),
  });
  if (pocketGroup) zones.push(pocketGroup);

  return zones;
}
