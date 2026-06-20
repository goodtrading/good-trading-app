import type { MacroContext, MicroContext } from "./v2DataSchema";
import {
  mapKeyZonesFromMacro,
  mapKeyZonesFromMicro,
  KEY_ZONE_LABEL_GLOBAL_FLIP,
  KEY_ZONE_LABEL_LOCAL_FLIP,
  type KeyZoneViewModel,
} from "./v2UiMappers";

export type MarketScopeLabel = "Macro" | "Micro";

export {
  KEY_ZONE_LABEL_GLOBAL_FLIP,
  KEY_ZONE_LABEL_LOCAL_FLIP,
} from "./v2UiMappers";

export function flipLabelForMode(mode: MarketScopeLabel): string {
  return mode === "Micro" ? KEY_ZONE_LABEL_LOCAL_FLIP : KEY_ZONE_LABEL_GLOBAL_FLIP;
}

export function areKeyZonesEqual(
  left: KeyZoneViewModel[],
  right: KeyZoneViewModel[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((zone, index) => {
    const other = right[index];
    return (
      zone.id === other.id &&
      zone.groupType === other.groupType &&
      zone.label === other.label &&
      zone.price === other.price &&
      zone.type === other.type &&
      zone.distance === other.distance &&
      zone.barColor === other.barColor &&
      zone.stale === other.stale &&
      zone.moreCount === other.moreCount &&
      zone.modalTitle === other.modalTitle &&
      JSON.stringify(zone.items ?? []) === JSON.stringify(other.items ?? [])
    );
  });
}

export function keyZonesSignature(zones: KeyZoneViewModel[]): string {
  return JSON.stringify(zones);
}

/** Stable React key for grouped and single zones. */
export function buildZoneKey(zone: KeyZoneViewModel): string {
  return zone.id;
}

export function findDuplicateZoneKeys(
  zones: KeyZoneViewModel[],
): Array<{ key: string; count: number; labels: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const zone of zones) {
    const key = buildZoneKey(zone);
    const labels = grouped.get(key) ?? [];
    labels.push(zone.label);
    grouped.set(key, labels);
  }

  return [...grouped.entries()]
    .filter(([, labels]) => labels.length > 1)
    .map(([key, labels]) => ({ key, count: labels.length, labels }));
}

export function selectKeyZonesForScope(args: {
  mode: MarketScopeLabel;
  micro: MicroContext | null;
  macro: MacroContext | null;
  spot: number | null;
}): KeyZoneViewModel[] {
  const { mode, micro, macro, spot } = args;
  if (mode === "Micro") {
    return micro ? mapKeyZonesFromMicro(micro, spot) : [];
  }
  return macro ? mapKeyZonesFromMacro(macro, spot) : [];
}

export function stabilizeKeyZones(
  previous: { signature: string; zones: KeyZoneViewModel[] },
  nextZones: KeyZoneViewModel[],
): { signature: string; zones: KeyZoneViewModel[] } {
  const signature = keyZonesSignature(nextZones);
  if (signature === previous.signature) {
    return previous;
  }
  return { signature, zones: nextZones };
}
