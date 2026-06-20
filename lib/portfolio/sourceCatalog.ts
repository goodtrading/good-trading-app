import type { PortfolioSourceId, PortfolioSourceMeta } from "./types";

export const PORTFOLIO_SOURCE_CATALOG: Record<PortfolioSourceId, PortfolioSourceMeta> = {
  paper: {
    id: "paper",
    name: "Paper Trading",
    shortLabel: "P",
    type: "paper",
    brandColor: "#666666",
    isVisible: true,
  },
  binance: {
    id: "binance",
    name: "Binance",
    shortLabel: "BN",
    type: "exchange",
    brandColor: "#F3BA2F",
    isVisible: true,
  },
  bingx: {
    id: "bingx",
    name: "BingX",
    shortLabel: "BX",
    type: "exchange",
    brandColor: "#2B65F0",
    isVisible: true,
  },
  all: {
    id: "all",
    name: "Todas las cuentas",
    shortLabel: "ALL",
    type: "consolidated",
    brandColor: "#e01e2e",
    isVisible: false,
  },
};

export const VISIBLE_PORTFOLIO_SOURCE_IDS: PortfolioSourceId[] = (
  Object.values(PORTFOLIO_SOURCE_CATALOG) as PortfolioSourceMeta[]
)
  .filter((source) => source.isVisible)
  .map((source) => source.id);

export function getSourceMeta(id: PortfolioSourceId): PortfolioSourceMeta {
  return PORTFOLIO_SOURCE_CATALOG[id];
}
