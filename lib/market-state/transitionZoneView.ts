import type { DataStatus } from "@/shared/mobileMarketStateV2.contract";

import { shouldHideMetric } from "./dataStatusUi";
import type { MicroContext } from "./v2DataSchema";

function formatTransitionPart(part: string): string {
  const trimmed = part.trim();
  const kMatch = trimmed.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) {
    const value = Number(kMatch[1]) * 1_000;
    if (Number.isFinite(value)) {
      return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
  }

  const numeric = Number(trimmed.replace(/,/g, ""));
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  return trimmed;
}

export function formatMicroTransitionZone(
  field: { value: string | null; status: DataStatus } | null | undefined,
): string | null {
  if (!field) return null;
  if (shouldHideMetric(field.status) || field.status === "unavailable" || field.status === "calculation_error") {
    return null;
  }

  const raw = field.value?.trim();
  if (!raw) return null;

  const parts = raw.split(/[-–]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    return `${formatTransitionPart(parts[0])} - ${formatTransitionPart(parts[1])}`;
  }

  return formatTransitionPart(raw);
}

export function readMicroTransitionZone(micro: MicroContext | null | undefined): string | null {
  if (!micro?.localTransitionZone) return null;
  return formatMicroTransitionZone(micro.localTransitionZone);
}
