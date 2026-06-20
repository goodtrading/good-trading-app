import type { DataStatus } from "@/shared/mobileMarketStateV2.contract";

import { shouldHideMetric } from "./dataStatusUi";
import type { MacroContext, MicroContext } from "./v2DataSchema";

export type HeaderMarketScope = "Macro" | "Micro";

export type HeaderRegimeField = {
  value: string | null;
  status: DataStatus;
};

export function readV2MicroRegime(micro: MicroContext | null | undefined): HeaderRegimeField | null {
  if (!micro?.localRegime) return null;
  return {
    value: micro.localRegime.value,
    status: micro.localRegime.status,
  };
}

export function readV2MacroRegime(macro: MacroContext | null | undefined): HeaderRegimeField | null {
  if (!macro?.globalRegime) return null;
  return {
    value: macro.globalRegime.value,
    status: macro.globalRegime.status,
  };
}

export function formatRegimeForHeader(field: HeaderRegimeField | null): string {
  if (!field) return "REGIME UNAVAILABLE";

  const { value, status } = field;
  if (
    shouldHideMetric(status) ||
    status === "unavailable" ||
    status === "calculation_error" ||
    value == null ||
    !String(value).trim()
  ) {
    return "REGIME UNAVAILABLE";
  }

  const text = String(value).toUpperCase().replace(/_/g, " ");
  if (text.includes("LONG")) return "LONG GAMMA";
  if (text.includes("SHORT")) return "SHORT GAMMA";
  return "REGIME UNAVAILABLE";
}

export function resolveHeaderRegimeFromV2(args: {
  scope: HeaderMarketScope;
  micro: MicroContext | null | undefined;
  macro: MacroContext | null | undefined;
  fallbackLabel: string;
  useV2Regime: boolean;
}): {
  displayedRegime: string;
  microRegime: string | null;
  macroRegime: string | null;
} {
  const microField = readV2MicroRegime(args.micro);
  const macroField = readV2MacroRegime(args.macro);
  const microRegime = microField?.value ?? null;
  const macroRegime = macroField?.value ?? null;

  if (!args.useV2Regime) {
    return {
      displayedRegime: args.fallbackLabel,
      microRegime,
      macroRegime,
    };
  }

  const selectedField = args.scope === "Micro" ? microField : macroField;
  return {
    displayedRegime: formatRegimeForHeader(selectedField),
    microRegime,
    macroRegime,
  };
}

export type HeaderRegimeTone = "long" | "short" | "unavailable";

export function resolveHeaderRegimeTone(regime: string): HeaderRegimeTone {
  if (regime === "LONG GAMMA") return "long";
  if (regime === "SHORT GAMMA") return "short";
  return "unavailable";
}

export function resolveRegimeTextColor(
  regime: string,
  palette: { success: string; destructive: string; mutedForeground: string },
): string {
  const tone = resolveHeaderRegimeTone(regime);
  if (tone === "long") return palette.success;
  if (tone === "short") return palette.destructive;
  return palette.mutedForeground;
}
