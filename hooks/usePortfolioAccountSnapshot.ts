import { useMemo } from "react";

import {
  buildPortfolioAccountSnapshot,
  type PortfolioAccountSnapshot,
} from "@/lib/portfolio/accounts/portfolioAccountSnapshot";
import {
  useSpotBalances,
  useSpotOpenPositions,
} from "@/hooks/useSpotLedger";
import type { PerpWalletSnapshot } from "@/lib/portfolio/wallets/types";
import type { PortfolioEngineState } from "@/lib/portfolio/types";

export type UsePortfolioAccountSnapshotArgs = {
  accountId: string | null;
  markPrice: number;
  perpWallet: PerpWalletSnapshot | null;
  perpState: PortfolioEngineState | null;
};

/**
 * Canonical account snapshot — UI must consume this exclusively.
 */
export function usePortfolioAccountSnapshot({
  accountId,
  markPrice,
  perpWallet,
  perpState,
}: UsePortfolioAccountSnapshotArgs): PortfolioAccountSnapshot | null {
  const spotBalances = useSpotBalances(accountId);
  const spotPositions = useSpotOpenPositions(accountId);

  return useMemo(() => {
    if (!accountId) return null;

    const usdt = spotBalances.find((b) => b.asset === "USDT");
    const spotWallet = {
      accountId,
      usdtFree: usdt?.free ?? 0,
      usdtLocked: usdt?.locked ?? 0,
      usdtTotal: usdt?.total ?? 0,
      balances: spotBalances.map((b) => ({ ...b })),
    };

    return buildPortfolioAccountSnapshot({
      accountId,
      markPrice,
      spotWallet,
      spotPositions,
      perpWallet,
      perpPositions: perpState?.positions ?? [],
    });
  }, [
    accountId,
    markPrice,
    perpState?.positions,
    perpWallet,
    spotBalances,
    spotPositions,
  ]);
}
