export interface PortfolioAccount {
  id: string;
  name: string;
  initialBalance: number;
  createdAt: number;
}

export interface PortfolioAccountsRegistry {
  accounts: PortfolioAccount[];
  activeAccountId: string | null;
}
