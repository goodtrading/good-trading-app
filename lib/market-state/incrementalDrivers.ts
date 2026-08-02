/**
 * Presentation-only filter: hide drivers that exactly duplicate Header fields.
 * Complementary context (regime nuance, flip proximity, etc.) is kept.
 */

export type IncrementalDriverFilterContext = {
  regime: string;
  marketMode: string;
  confidence: number | null;
  setup?: string;
  transitionZone?: string | null;
  scope: "Macro" | "Micro";
  zoneLabels: string[];
};

function normalizeToken(value: string): string {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function headerFieldsForContext(ctx: IncrementalDriverFilterContext): string[] {
  const fields = [ctx.regime, ctx.marketMode];
  if (ctx.scope === "Micro" && ctx.transitionZone) {
    fields.push(ctx.transitionZone);
  }
  if (ctx.scope === "Macro" && ctx.setup) {
    fields.push(ctx.setup);
  }
  return fields.filter(Boolean);
}

export function isIncrementalDriver(driver: string, ctx: IncrementalDriverFilterContext): boolean {
  const normalized = normalizeToken(driver);
  if (!normalized) return false;

  return !headerFieldsForContext(ctx).some((field) => normalized === normalizeToken(field));
}

export function filterIncrementalDrivers(
  drivers: string[],
  ctx: IncrementalDriverFilterContext,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const driver of drivers) {
    const normalized = normalizeToken(driver);
    if (!normalized || seen.has(normalized)) continue;
    if (!isIncrementalDriver(normalized, ctx)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
