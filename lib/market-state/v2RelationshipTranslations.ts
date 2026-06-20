import type { RelationshipDescriptionCode } from "@/lib/market-state/v2DataSchema";

export type RelationshipTranslation = {
  title: string;
  body: string;
  tone: "neutral" | "positive" | "warning" | "danger";
};

export const RELATIONSHIP_DESCRIPTION_TRANSLATIONS: Record<
  RelationshipDescriptionCode,
  RelationshipTranslation
> = {
  REGIME_ALIGNED: {
    title: "Régimen alineado",
    body: "Micro y macro confirman la misma lectura estructural.",
    tone: "positive",
  },
  REGIME_DIVERGENT: {
    title: "Régimen divergente",
    body: "Micro y macro no coinciden; operar con cautela.",
    tone: "warning",
  },
  LOCAL_ABOVE_GLOBAL: {
    title: "Flip local sobre global",
    body: "El flip local está por encima del flip global.",
    tone: "neutral",
  },
  LOCAL_BELOW_GLOBAL: {
    title: "Flip local bajo global",
    body: "El flip local está por debajo del flip global.",
    tone: "neutral",
  },
  CONTEXT_CONFLICT_WAIT: {
    title: "Conflicto de contexto",
    body: "Esperar confirmación antes de forzar dirección.",
    tone: "danger",
  },
  TREND_CONTINUATION_LIKELY: {
    title: "Continuación probable",
    body: "La relación micro/macro favorece continuidad de tendencia.",
    tone: "positive",
  },
};

export function translateRelationshipDescriptionCode(
  code: RelationshipDescriptionCode | null | undefined,
): RelationshipTranslation | null {
  if (!code) return null;
  return RELATIONSHIP_DESCRIPTION_TRANSLATIONS[code] ?? null;
}
