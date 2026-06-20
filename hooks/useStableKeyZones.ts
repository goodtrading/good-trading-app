import { useRef } from "react";

import {
  keyZonesSignature,
  stabilizeKeyZones,
  selectKeyZonesForScope,
  findDuplicateZoneKeys,
  type MarketScopeLabel,
} from "@/lib/market-state/keyZoneSelectors";
import {
  auditSignature,
  resolveKeyZonesStableBranch,
  type KeyZonesStableBranch,
} from "@/lib/market-state/keyZonesRuntimeAudit";
import type { KeyZoneViewModel } from "@/lib/market-state/v2UiMappers";
import type { MacroContext, MicroContext } from "@/lib/market-state/v2DataSchema";

type UseStableKeyZonesArgs = {
  enabled: boolean;
  mode: MarketScopeLabel;
  micro: MicroContext | null;
  macro: MacroContext | null;
  spot: number | null;
  fallbackZones: KeyZoneViewModel[];
};

type StableKeyZonesResult = {
  zones: KeyZoneViewModel[];
  branch: KeyZonesStableBranch;
};

/**
 * Returns a referentially stable zones array while polling updates snapshot metadata
 * but mapped zone content stays identical.
 */
export function useStableKeyZones({
  enabled,
  mode,
  micro,
  macro,
  spot,
  fallbackZones,
}: UseStableKeyZonesArgs): StableKeyZonesResult {
  const cacheRef = useRef<{ signature: string; zones: KeyZoneViewModel[] }>({
    signature: "",
    zones: [],
  });
  const prevEnabledRef = useRef(enabled);
  const branchRef = useRef<KeyZonesStableBranch>("legacy-fallback");

  if (!prevEnabledRef.current && enabled) {
    cacheRef.current = { signature: "", zones: [] };
  }
  prevEnabledRef.current = enabled;

  if (!enabled) {
    const fallbackSignature = JSON.stringify(fallbackZones);
    if (fallbackSignature !== cacheRef.current.signature) {
      cacheRef.current = { signature: fallbackSignature, zones: fallbackZones };
    }
    branchRef.current = "legacy-fallback";
    return { zones: cacheRef.current.zones, branch: branchRef.current };
  }

  if (!micro || !macro) {
    branchRef.current = "v2-context-missing";
    return { zones: [], branch: branchRef.current };
  }

  const mapped = selectKeyZonesForScope({ mode, micro, macro, spot });
  if (__DEV__) {
    const duplicates = findDuplicateZoneKeys(mapped);
    if (duplicates.length > 0) {
      console.log("[useStableKeyZones] duplicate keys before stabilize", duplicates);
    }
  }
  const nextSignature = keyZonesSignature(mapped);
  const previousSignature = cacheRef.current.signature;
  branchRef.current = resolveKeyZonesStableBranch({
    enabled,
    micro,
    macro,
    cacheSignature: previousSignature,
    nextSignature,
  });
  cacheRef.current = stabilizeKeyZones(cacheRef.current, mapped);
  return { zones: cacheRef.current.zones, branch: branchRef.current };
}

export function __testOnlyResetStableKeyZonesState(): void {
  // no-op placeholder for future hook state resets in tests
}
