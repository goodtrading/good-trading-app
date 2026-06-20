import type { DataStatus } from "@/shared/mobileMarketStateV2.contract";

export type DataStatusUiAction = "show" | "show_stale" | "hide" | "unavailable" | "degraded";

export function resolveDataStatusUi(status: DataStatus): DataStatusUiAction {
  switch (status) {
    case "available":
      return "show";
    case "stale":
      return "show_stale";
    case "unavailable":
      return "unavailable";
    case "not_applicable":
      return "hide";
    case "calculation_error":
      return "degraded";
    default:
      return "unavailable";
  }
}

export function formatValuedField<T>(
  status: DataStatus,
  value: T | null,
  format: (value: T) => string,
): string | null {
  const action = resolveDataStatusUi(status);

  if (action === "hide") return null;
  if (action === "unavailable") return "No disponible";
  if (action === "degraded") return "Error de cálculo";

  if (value == null) {
    if (action === "show_stale") return "No disponible";
    return "No disponible";
  }

  return format(value);
}

export function shouldHideMetric(status: DataStatus): boolean {
  return resolveDataStatusUi(status) === "hide";
}

export function isStaleMetric(status: DataStatus): boolean {
  return status === "stale";
}
