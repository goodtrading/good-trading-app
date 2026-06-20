export type FlipDistanceTone = "above" | "below" | "neutral";

export function calculateFlipDistancePct(spot: number, flip: number): number | undefined {
  if (!Number.isFinite(spot) || !Number.isFinite(flip) || flip === 0) return undefined;
  return ((spot - flip) / flip) * 100;
}

export function formatFlipDistanceLabel(distancePct: number): string {
  const abs = Math.abs(distancePct).toFixed(2);
  if (distancePct > 0) return `+${abs}% sobre Flip`;
  if (distancePct < 0) return `-${abs}% bajo Flip`;
  return `0.00% en Flip`;
}

export function resolveFlipDistanceTone(spot: number, flip: number): FlipDistanceTone {
  if (spot > flip) return "above";
  if (spot < flip) return "below";
  return "neutral";
}

export function absFlipDistance(distancePct: number | undefined): number {
  if (distancePct == null || !Number.isFinite(distancePct)) return Number.POSITIVE_INFINITY;
  return Math.abs(distancePct);
}
