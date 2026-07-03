/**
 * Bounded-context identifiers for Cartera.
 * These are domain contexts — not navigation tabs.
 */
export type CarteraContext = "TRADING" | "INVENTORY" | "PORTFOLIO";

export const CARTERA_CONTEXTS: CarteraContext[] = ["TRADING", "INVENTORY", "PORTFOLIO"];

export const DEFAULT_CARTERA_CONTEXT: CarteraContext = "TRADING";

export const CARTERA_CONTEXT_LABELS: Record<CarteraContext, string> = {
  TRADING: "Trading",
  INVENTORY: "Inventario",
  PORTFOLIO: "Portfolio",
};
