export type { CarteraContext } from "./types";
export {
  CARTERA_CONTEXTS,
  CARTERA_CONTEXT_LABELS,
  DEFAULT_CARTERA_CONTEXT,
} from "./types";
export {
  loadActiveCarteraContext,
  saveActiveCarteraContext,
  CARTERA_ACTIVE_CONTEXT_STORAGE_KEY,
} from "./storage/carteraContextStorage";
export { loadPortfolioReadModel, PortfolioReadModelService } from "./read/portfolioReadModelService";
export type {
  PortfolioReadModel,
  WealthSlice,
  PerformanceMetric,
  PerformanceWindow,
} from "./read/types";
export { wealthSliceColor } from "./read/types";
export {
  aggregatePositionsBySymbol,
  buildPortfolioReadModel,
  groupSmallSlices,
  ledgerProjectionToPositions,
} from "./read/portfolioReadProjection";
export {
  validateLedgerEntry,
  assertLedgerIntegrity,
  tradeToTradeExecutionEntry,
  ledgerEntrySchema,
  legacyTradeSchema,
  LedgerValidationError,
  LedgerIntegrityError,
  type LedgerEntry,
  type TradeExecutionEntry,
  type LedgerEntryType,
} from "./ledger/LedgerEntrySchema";
export {
  LedgerTransaction,
  beginLedgerTransaction,
  commitGenesisLedger,
  assertPersistedLedgerIntegrity,
  rejectLedgerMutation,
  rejectLedgerReset,
  LedgerMutationForbiddenError,
  LedgerTransactionError,
} from "./ledger/LedgerTransaction";
export { isLedgerCommitActive, runWithinLedgerCommit } from "./ledger/ledgerCommitContext";
export { assertLedgerSavePermitted } from "./ledger/ledgerStorageGuard";
export {
  PORTFOLIO_READ_MODEL_SCHEMA_VERSION,
  migratePortfolioReadModel,
  parsePortfolioReadModel,
  stampPortfolioReadModel,
  portfolioReadModelV1Schema,
} from "./read/portfolioReadModelSchema";
export {
  TradingContextProvider,
  useTradingContext,
  type TradingContextValue,
} from "./context/TradingContext";
export {
  InventoryContextProvider,
  useInventoryContext,
  type InventoryContextValue,
  type InventoryHolding,
} from "./context/InventoryContext";
export {
  PortfolioContextProvider,
  usePortfolioReadContext,
  type PortfolioReadContextValue,
} from "./context/PortfolioContext";
