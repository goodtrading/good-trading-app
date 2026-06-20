import type { DistanceMetrics } from "@/shared/mobileMarketStateV2.contract";

export function formatDistanceHuman(metric: DistanceMetrics): string | null {
  if (metric.status === "not_applicable") return null;
  if (metric.status === "unavailable") return "No disponible";
  if (metric.status === "calculation_error") return "Error de cálculo";

  if (metric.distancePct == null) return "No disponible";

  const magnitude = `${Math.abs(metric.distancePct).toFixed(2)}%`;
  if (metric.position === "above_spot") return `${magnitude} arriba`;
  if (metric.position === "below_spot") return `${magnitude} abajo`;
  if (metric.position === "at_spot") return "En nivel";

  return magnitude;
}

export function formatDominantExpiryDate(date: string | null): string | null {
  if (!date) return null;
  const parsed = Date.parse(date);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
