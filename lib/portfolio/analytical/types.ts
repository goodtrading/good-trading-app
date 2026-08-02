export type WalletAccountRef =
  | { kind: "paper"; accountId: string }
  | { kind: "exchange"; sourceId: "binance" | "bingx" };

export type AnalyticalPortfolio = {
  id: string;
  name: string;
  memberRefs: WalletAccountRef[];
};

export const DEFAULT_TOTAL_PORTFOLIO_ID = "total";

export const DEFAULT_TOTAL_PORTFOLIO: AnalyticalPortfolio = {
  id: DEFAULT_TOTAL_PORTFOLIO_ID,
  name: "Patrimonio total",
  memberRefs: [],
};
