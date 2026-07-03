import { loadAccountsRegistry } from "@/lib/portfolio/accounts/accountStorage";
import { loadExchangeConnections } from "@/lib/portfolio/exchanges/exchangeConnectionStorage";
import { deriveEngineState } from "@/lib/portfolio/portfolioEngine";
import { portfolioProviderRegistry } from "@/lib/portfolio/registry";
import type { PortfolioPosition } from "@/lib/portfolio/types";

import { readAccountLedger } from "./ledgerReadRepository";
import {
  buildPortfolioReadModel,
  ledgerProjectionToPositions,
} from "./portfolioReadProjection";
import { parsePortfolioReadModel } from "./portfolioReadModelSchema";
import type { PortfolioReadModel } from "./types";

/**
 * Pure read-only portfolio aggregation boundary.
 *
 * Rules:
 * - MUST NOT instantiate PortfolioEngine
 * - MUST NOT call broker adapters
 * - MUST NOT mutate ledger or any persisted state
 * - Reads ledger via LedgerReadRepository + pure projection (deriveEngineState)
 */
export const PortfolioReadModelService = {
  async load(marketPrice: number): Promise<PortfolioReadModel> {
    const [registry, connections] = await Promise.all([
      loadAccountsRegistry(),
      loadExchangeConnections(),
    ]);

    const allPositions: PortfolioPosition[] = [];
    let todayPnl = 0;

    for (const account of registry.accounts) {
      const ledger = await readAccountLedger(account.id);
      const projection = deriveEngineState(ledger, marketPrice);
      allPositions.push(...ledgerProjectionToPositions(projection));
    }

    const exchangeIds: Array<"binance" | "bingx"> = [];
    if (connections.binance.connected) exchangeIds.push("binance");
    if (connections.bingx.connected) exchangeIds.push("bingx");

    for (const exchangeId of exchangeIds) {
      const provider = portfolioProviderRegistry.get(exchangeId);
      if (!provider) continue;
      const snapshot = await provider.getSnapshot();
      allPositions.push(...snapshot.positions);
      todayPnl += snapshot.balance.todayPnl;
    }

    return parsePortfolioReadModel(
      buildPortfolioReadModel({ positions: allPositions, todayPnl }),
    );
  },
};

export async function loadPortfolioReadModel(marketPrice: number): Promise<PortfolioReadModel> {
  return PortfolioReadModelService.load(marketPrice);
}
