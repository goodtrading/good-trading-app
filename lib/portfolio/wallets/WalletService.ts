import { runWithinLedgerCommit } from "@/lib/cartera/ledger/ledgerCommitContext";
import { createPortfolioStorageForAccount } from "@/lib/portfolio/accounts/accountPortfolioStorage";
import { PORTFOLIO_V1_SYMBOL } from "@/lib/portfolio/constants";
import {
  resolveWalletCash,
} from "@/lib/portfolio/futures/futuresAccounting";
import { derivePerpWalletMetrics } from "@/lib/portfolio/futures/derivePerpWalletMetrics";
import { buildOpenOcoGroupSnapshots, ocoRuntime } from "@/lib/portfolio/oco/OcoRuntime";
import {
  buildOpenTrailingStopSnapshots,
  trailingStopRuntime,
} from "@/lib/portfolio/trailing/TrailingStopRuntime";
import {
  buildInsuranceFundSnapshot,
  insuranceFundRuntime,
  listRecentInsuranceFundHistory,
} from "@/lib/portfolio/insurance/InsuranceFundRuntime";
import { orderRegistryEngine } from "@/lib/portfolio/orderRegistry/OrderRegistryEngine";
import {
  accumulatePositionFromTrades,
} from "@/lib/portfolio/positionEngine";
import { SpotLedger } from "@/lib/portfolio/spot/SpotLedger";
import { spotLedgerRuntime } from "@/lib/portfolio/spot/SpotLedgerRuntime";
import { createSpotBalance } from "@/lib/portfolio/spot/types";
import type { PerpWalletSnapshot, SpotWalletSnapshot } from "@/lib/portfolio/wallets/types";

export class WalletTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletTransferError";
  }
}

/**
 * PaperAccount wallets: SpotWallet + PerpWallet.
 *
 * SpotWallet  → SpotLedger (spot/balances/v1)
 * PerpWallet  → PERP ledger `walletCash` (mutable) + derived margin metrics
 *
 * `initialCashBalance` is immutable genesis history — transfers never touch it.
 * Transfers move USDT only; never append trades or alter history.
 */
export class WalletService {
  async getSpotWallet(accountId: string): Promise<SpotWalletSnapshot> {
    const ledger = await this.loadSpotLedger(accountId);
    const state = ledger.getState() ?? (await ledger.load());
    if (!state) {
      return emptySpotWallet(accountId);
    }

    const usdt = state.balances.find((b) => b.asset === "USDT");
    return {
      accountId,
      usdtFree: usdt?.free ?? 0,
      usdtLocked: usdt?.locked ?? 0,
      usdtTotal: usdt?.total ?? 0,
      balances: state.balances.map((b) => ({ ...b })),
    };
  }

  async getPerpWallet(
    accountId: string,
    marketPrice: number = 0,
  ): Promise<PerpWalletSnapshot> {
    const storage = createPortfolioStorageForAccount(accountId);
    const persisted = await storage.load();
    const walletCash = resolveWalletCash(persisted);
    const { realizedPnL } = accumulatePositionFromTrades(persisted.trades);
    const mark = marketPrice > 0 ? marketPrice : lastTradePrice(persisted.trades) ?? 0;

    await ocoRuntime.restoreFromPersisted(accountId, persisted.ocoGroups);
    await trailingStopRuntime.restoreFromPersisted(accountId, persisted.trailingStops);
    await insuranceFundRuntime.restoreFromPersisted(accountId, persisted.insuranceFund);
    const [activeGroups, orders, activeTrailing, insuranceState] = await Promise.all([
      ocoRuntime.listActive(accountId),
      orderRegistryEngine.list(accountId),
      trailingStopRuntime.listActive(accountId),
      insuranceFundRuntime.getState(accountId),
    ]);
    const openOcoGroups = buildOpenOcoGroupSnapshots(activeGroups, orders);
    const openTrailingStops = buildOpenTrailingStopSnapshots(activeTrailing);
    const insuranceFund = buildInsuranceFundSnapshot(insuranceState);
    const insuranceFundHistory = listRecentInsuranceFundHistory(insuranceState);

    const { snapshot } = derivePerpWalletMetrics({
      accountId,
      initialCashBalance: persisted.initialCashBalance,
      walletCash,
      realizedPnL,
      trades: persisted.trades,
      financialEvents: persisted.financialEvents,
      markPrice: mark,
      openOcoGroups,
      openTrailingStops,
      insuranceFund,
      insuranceFundHistory,
    });

    return snapshot;
  }

  /**
   * Move USDT from SpotWallet free → PerpWallet `walletCash`.
   * Does not create trades or mutate genesis deposit.
   */
  async transferSpotToPerp(accountId: string, amount: number): Promise<void> {
    assertPositiveAmount(amount);

    const ledger = await this.loadSpotLedger(accountId);
    const state = ledger.getState() ?? (await ledger.load());
    if (!state) {
      throw new WalletTransferError("SpotWallet not found");
    }

    const balances = state.balances.map((b) =>
      createSpotBalance(b.asset, b.free, b.locked),
    );
    const usdt = balances.find((b) => b.asset === "USDT");
    if (!usdt || usdt.free < amount) {
      throw new WalletTransferError(
        `Insufficient Spot USDT: need ${amount}, free ${usdt?.free ?? 0}`,
      );
    }

    usdt.free -= amount;
    usdt.total = usdt.free + usdt.locked;
    await ledger.persistBalances(
      balances.filter((b) => b.free !== 0 || b.locked !== 0),
    );

    const storage = createPortfolioStorageForAccount(accountId);
    await runWithinLedgerCommit(async () => {
      const persisted = await storage.load();
      const walletCash = resolveWalletCash(persisted);
      await storage.save({
        ...persisted,
        initialCashBalance: persisted.initialCashBalance,
        walletCash: walletCash + amount,
      });
    });
  }

  /**
   * Move USDT from PerpWallet available → SpotWallet free.
   * Does not create trades or mutate genesis deposit.
   */
  async transferPerpToSpot(
    accountId: string,
    amount: number,
    marketPrice: number = 0,
  ): Promise<void> {
    assertPositiveAmount(amount);

    const storage = createPortfolioStorageForAccount(accountId);
    await runWithinLedgerCommit(async () => {
      const persisted = await storage.load();
      const walletCash = resolveWalletCash(persisted);
      const { realizedPnL } = accumulatePositionFromTrades(persisted.trades);
      const mark = marketPrice > 0 ? marketPrice : lastTradePrice(persisted.trades) ?? 0;
      const { snapshot } = derivePerpWalletMetrics({
        accountId,
        initialCashBalance: persisted.initialCashBalance,
        walletCash,
        realizedPnL,
        trades: persisted.trades,
        financialEvents: persisted.financialEvents,
        markPrice: mark,
      });
      if (snapshot.availableBalance < amount) {
        throw new WalletTransferError(
          `Insufficient Perp USDT: need ${amount}, available ${snapshot.availableBalance}`,
        );
      }
      await storage.save({
        ...persisted,
        initialCashBalance: persisted.initialCashBalance,
        walletCash: walletCash - amount,
      });
    });

    const ledger = await this.loadSpotLedger(accountId);
    const state = ledger.getState() ?? (await ledger.load());
    if (!state) {
      throw new WalletTransferError("SpotWallet not found");
    }

    const balances = state.balances.map((b) =>
      createSpotBalance(b.asset, b.free, b.locked),
    );
    let usdt = balances.find((b) => b.asset === "USDT");
    if (!usdt) {
      usdt = createSpotBalance("USDT", 0, 0);
      balances.push(usdt);
    }
    usdt.free += amount;
    usdt.total = usdt.free + usdt.locked;
    await ledger.persistBalances(balances);
  }

  private async loadSpotLedger(accountId: string): Promise<SpotLedger> {
    return spotLedgerRuntime.start(accountId, {
      createIfMissing: true,
      initialUsdt: 0,
    });
  }
}

function emptySpotWallet(accountId: string): SpotWalletSnapshot {
  return {
    accountId,
    usdtFree: 0,
    usdtLocked: 0,
    usdtTotal: 0,
    balances: [],
  };
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WalletTransferError("Transfer amount must be greater than zero");
  }
}

function lastTradePrice(
  trades: { price: number; timestamp: number }[],
): number | null {
  if (trades.length === 0) return null;
  const sorted = [...trades].sort((a, b) => b.timestamp - a.timestamp);
  return sorted[0]?.price ?? null;
}

export const walletService = new WalletService();
