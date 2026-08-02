import { useMemo, useSyncExternalStore } from "react";

import type { OrderEntity } from "@/lib/portfolio/orderRegistry/OrderEntity";
import type { SpotPositionLive } from "@/lib/portfolio/spot/SpotPosition";
import { spotLedgerStore } from "@/lib/portfolio/spot/SpotLedgerStore";
import { spotOrderToViewEntity } from "@/lib/portfolio/spot/spotOrderView";
import type { SpotBalance, SpotTrade } from "@/lib/portfolio/spot/types";
import type { SpotWalletSnapshot } from "@/lib/portfolio/wallets/types";

function subscribe(listener: () => void): () => void {
  return spotLedgerStore.subscribe(listener);
}

function subscribePositions(listener: () => void): () => void {
  return spotLedgerStore.subscribePositions(listener);
}

export function useSpotBalances(walletId: string | null): SpotBalance[] {
  return useSyncExternalStore(
    subscribe,
    () => spotLedgerStore.getBalancesSnapshot(walletId ?? ""),
    () => spotLedgerStore.getBalancesSnapshot(walletId ?? ""),
  );
}

export function useSpotTrades(walletId: string | null): SpotTrade[] {
  return useSyncExternalStore(
    subscribe,
    () => spotLedgerStore.getTradesSnapshot(walletId ?? ""),
    () => spotLedgerStore.getTradesSnapshot(walletId ?? ""),
  );
}

export function useSpotOpenOrders(walletId: string | null) {
  return useSyncExternalStore(
    subscribe,
    () => spotLedgerStore.getOpenOrders(walletId ?? ""),
    () => spotLedgerStore.getOpenOrders(walletId ?? ""),
  );
}

export function useSpotOpenPositions(walletId: string | null): SpotPositionLive[] {
  return useSyncExternalStore(
    subscribePositions,
    () => spotLedgerStore.getOpenPositionsSnapshot(walletId ?? ""),
    () => spotLedgerStore.getOpenPositionsSnapshot(walletId ?? ""),
  );
}

export function useSpotOpenOrderEntities(walletId: string | null): OrderEntity[] {
  const orders = useSpotOpenOrders(walletId);
  return useMemo(() => orders.map(spotOrderToViewEntity), [orders]);
}

export function useSpotWalletSnapshot(
  accountId: string | null,
): SpotWalletSnapshot | null {
  const balances = useSpotBalances(accountId);
  return useMemo(() => {
    if (!accountId) return null;
    const usdt = balances.find((b) => b.asset === "USDT");
    return {
      accountId,
      usdtFree: usdt?.free ?? 0,
      usdtLocked: usdt?.locked ?? 0,
      usdtTotal: usdt?.total ?? 0,
      balances: balances.map((b) => ({ ...b })),
    };
  }, [accountId, balances]);
}
