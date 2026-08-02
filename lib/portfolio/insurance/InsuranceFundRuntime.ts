import { beginLedgerTransaction } from "@/lib/cartera/ledger/LedgerTransaction";
import type { PortfolioStorage } from "@/lib/portfolio/storage/portfolioStorage";
import {
  createEmptyInsuranceFundState,
  hydrateInsuranceFundState,
  type InsuranceFundState,
} from "@/lib/portfolio/insurance/InsuranceFund";
import {
  resolveInsuranceSettlement,
  type InsuranceSettlementResult,
  type LiquidationInsuranceInput,
} from "@/lib/portfolio/insurance/InsuranceFundEngine";
import {
  buildInsuranceFundSnapshot,
  computeInsuranceFundDelta24h,
  listRecentInsuranceFundHistory,
} from "@/lib/portfolio/insurance/InsuranceFundSnapshot";
import { loadInsuranceFund, saveInsuranceFund } from "@/lib/portfolio/insurance/insuranceStorage";

export class InsuranceFundRuntime {
  async getState(walletId: string): Promise<InsuranceFundState> {
    return loadInsuranceFund(walletId);
  }

  async persist(walletId: string, state: InsuranceFundState): Promise<InsuranceFundState> {
    const hydrated = hydrateInsuranceFundState({ ...state, walletId });
    await saveInsuranceFund(walletId, hydrated);
    return hydrated;
  }

  buildSnapshot(state: InsuranceFundState) {
    return buildInsuranceFundSnapshot(state);
  }

  buildDelta24h(state: InsuranceFundState, now?: number) {
    return computeInsuranceFundDelta24h(state, now);
  }

  buildHistory(state: InsuranceFundState, limit?: number) {
    return listRecentInsuranceFundHistory(state, limit);
  }

  /** Legacy migration from PortfolioPersistedState.insuranceFund when dedicated storage is empty. */
  async restoreFromPersisted(
    walletId: string,
    legacy: InsuranceFundState | undefined,
  ): Promise<void> {
    if (!legacy) return;
    const existing = await loadInsuranceFund(walletId);
    if (existing.events.length > 0) return;
    await saveInsuranceFund(walletId, hydrateInsuranceFundState({ ...legacy, walletId }));
  }

  /**
   * Settles insurance fund after liquidation and mirrors events to FinancialEventLedger.
   * Does not alter user wallet cash or position engine state.
   */
  async settleLiquidation(
    walletId: string,
    input: Omit<LiquidationInsuranceInput, "walletId">,
    storage?: PortfolioStorage | null,
  ): Promise<InsuranceSettlementResult> {
    const current = await loadInsuranceFund(walletId);
    const settlement = resolveInsuranceSettlement(current, { ...input, walletId });
    await saveInsuranceFund(walletId, settlement.nextState);

    if (storage && settlement.financialEvents.length > 0) {
      const tx = await beginLedgerTransaction(storage);
      for (const event of settlement.financialEvents) {
        tx.appendFinancialEvent(event);
      }
      await tx.commit();
    }

    return settlement;
  }
}

export const insuranceFundRuntime = new InsuranceFundRuntime();

export {
  buildInsuranceFundSnapshot,
  computeInsuranceFundDelta24h,
  listRecentInsuranceFundHistory,
};
