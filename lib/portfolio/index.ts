export { PortfolioSourceProvider, usePortfolioSource } from "./PortfolioSourceProvider";
export { portfolioProviderRegistry } from "./registry";
export { getSourceMeta, PORTFOLIO_SOURCE_CATALOG, VISIBLE_PORTFOLIO_SOURCE_IDS } from "./sourceCatalog";
export { getMockSnapshot, mockPortfolioProviders } from "./mockProviders";
export { PORTFOLIO_V1_SYMBOL, DEFAULT_INITIAL_CASH_BALANCE } from "./constants";
export {
  createPortfolioEngine,
  deriveEngineState,
  PortfolioEngine,
  InsufficientCashError,
  InsufficientPositionError,
  RiskLimitError,
} from "./portfolioEngine";
export type { PortfolioEngineOptions } from "./portfolioEngine";
export {
  PortfolioEngineBootstrap,
  createPortfolioEngineBootstrap,
} from "./bootstrap/PortfolioEngineBootstrap";
export type { PortfolioEngineBootstrapConfig } from "./bootstrap/PortfolioEngineBootstrap";
export {
  hydratePortfolioEngine,
  loadEngineRuntimeMeta,
  saveEngineRuntimeMeta,
  captureEngineRuntimeMeta,
} from "./bootstrap/PortfolioEngineHydrator";
export type {
  EngineRuntimeMeta,
  HydrationResult,
} from "./bootstrap/PortfolioEngineHydrator";
export {
  portfolioEngineRuntime,
  getPortfolioEngineRuntime,
} from "./runtime/PortfolioEngineRuntime";
export type { PortfolioEngineRuntimeStartConfig } from "./runtime/PortfolioEngineRuntime";
export { MutableRiskPriceFeed } from "./runtime/MutableRiskPriceFeed";
export { priceStream } from "./runtime/PriceStream";
export type { PriceStreamListener } from "./runtime/PriceStream";
export type {
  RuntimeUiListener,
  RuntimeUiSnapshot,
  OrderBookState,
  OrderBookLevel,
} from "./runtime/PortfolioEngineRuntime";
export {
  buildTradeExecutionRequest,
} from "./trade/TradeExecutionRequest";
export type {
  TradeExecutionRequest,
  TradeDirection,
  TradeOrderType,
  MarginMode,
} from "./trade/TradeExecutionRequest";
export { executeTradeRequest } from "./trade/executeTradeRequest";
export {
  executionRouter,
  ExecutionRouter,
  toExecutionRequest,
  SpotContractError,
} from "./domain";
export type {
  TradingDomain,
  ExecutionRequest,
  ExecutionResult,
  SpotBalance,
  SpotTrade,
  SpotOrder,
  SpotExecutionIntent,
  PerpTrade,
  PerpPosition,
  PerpOrder,
  PerpExecutionIntent,
} from "./domain";

export {
  orderRegistryEngine,
  OrderRegistryEngine,
  createOrderPriceEvaluator,
  OrderPriceEvaluator,
  shouldTrigger,
  isOpenOrderStatus,
} from "./orderRegistry";
export type {
  OrderEntity,
  OrderStatus,
  OrderSide,
  RegisteredOrderType,
  RegisterOrderInput,
  OrderPriceEvaluatorDeps,
} from "./orderRegistry";
export {
  computeAccountMarginRatio,
  computeAvailableBalance,
  computeEquity,
  computeEquityAtRisk,
  computeLiquidationState,
  computePositionMarginRatio,
  computeWalletState,
} from "./futures/MarginModel";
export type { LiquidationState, WalletState } from "./futures/MarginModel";
export {
  computeExecutionFees,
  computePreviewFees,
  computeOpeningFee,
  computeClosingFee,
  computeMakerFee,
  computeTakerFee,
  createZeroTradeFees,
  createZeroExecutionFee,
  FEE_MODEL_VERSION,
  resolveExecutionNotional,
  ZERO_FEE_POLICY,
} from "./fees/FeeModel";
export {
  BINANCE_USDT_FUTURES_FEE_SCHEDULE,
  DEFAULT_FEE_SCHEDULE,
} from "./fees/FeeSchedule";
export { resolveWalletBalance, resolveWalletBalanceFromTrades } from "./fees/resolveWalletBalance";
export {
  FinancialEventLedger,
  aggregateFinancialEvents,
  hydrateFinancialEvents,
  FINANCIAL_EVENT_LEDGER_VERSION,
} from "./financial/FinancialEventLedger";
export { createTradeFeeEvent } from "./financial/tradeFeeToEvent";
export { buildFinancialHistoryFromLedger } from "./financial/buildFinancialHistoryFromLedger";
export type {
  FinancialEvent,
  FinancialEventType,
  FinancialEventAggregate,
  FinancialHistoryRow,
} from "./financial/types";
export {
  computeFundingRate,
  computeFundingPayment,
  settleFunding,
  scheduleFunding,
  isFundingDue,
  nextFundingTimestamp,
  getLastFundingTime,
  listFundingEvents,
  fundingCycleTimestamp,
  fundingIntervalMs,
  FUNDING_EVENT_PREFIX,
} from "./funding/FundingEngine";
export {
  BINANCE_USDT_FUNDING_SCHEDULE,
  DEFAULT_FUNDING_SCHEDULE,
} from "./funding/FundingSchedule";
export {
  FundingScheduler,
  createFundingScheduler,
} from "./funding/FundingScheduler";
export type { FundingClock } from "./funding/FundingScheduler";
export type { FundingSchedule, FundingPaymentInput, FundingSettlementInput } from "./funding/types";
export type { FeeComputationContext, PreviewFeeContext } from "./fees/FeeModel";
export { aggregateTradeFees } from "./fees/aggregateTradeFees";
export { hydrateTradeFees, hydrateTradeLedger } from "./fees/hydrateTradeFees";
export type {
  ExecutionFee,
  FeeBreakdown,
  FeePolicy,
  FeeSchedule,
  FeeType,
  PerpFeeMetrics,
  TradeFee,
  TradeFeeRecord,
} from "./fees/types";
export {
  buildPerpPositionPreview,
  perpPreviewToTradeEntrySummary,
} from "./futures/PerpPositionPreview";
export type { PerpPositionPreview } from "./futures/PerpPositionPreview";
export { derivePerpWalletMetrics } from "./futures/derivePerpWalletMetrics";
export {
  computeTradeEntrySummary,
  computeSpotEntrySummary,
  quantityFromMargin,
  marginFromPercent,
  percentFromMargin,
  positionValueFromMargin,
  formatMarginInput,
  formatQuantityDisplay,
} from "./trade/tradeEntryCalculations";
export type { TradeEntrySummary } from "./trade/tradeEntryCalculations";
export { validateTradeEntry } from "./trade/tradeEntryValidation";
export type {
  TradeEntryFieldErrors,
  TradeEntryValidationInput,
  TradeEntryValidationResult,
} from "./trade/tradeEntryValidation";
export {
  PortfolioSnapshotService,
  createPortfolioSnapshotService,
  ENGINE_VERSION,
} from "./snapshot/PortfolioSnapshotService";
export type {
  PortfolioEngineSnapshot,
  PortfolioEngineSnapshotInput,
  PortfolioRuntimeConfigSnapshot,
  RiskSchedulerSnapshotState,
} from "./snapshot/PortfolioSnapshotService";
export {
  LiquidationEngine,
  createLiquidationEngine,
  computeLiquidationPrice,
} from "./risk/LiquidationEngine";
export type { LiquidationResult } from "./risk/LiquidationEngine";
export {
  RiskScheduler,
  createRiskScheduler,
} from "./risk/RiskScheduler";
export type { RiskPriceFeed } from "./risk/RiskScheduler";
export {
  OrderEngine,
  createOrderEngine,
} from "./orders/OrderEngine";
export type {
  Order as TradingOrder,
  OrderSide,
  OrderType,
  OrderStatus,
  CreateMarketOrderInput,
  CreateLimitOrderInput,
  MarketOrderResult,
  CreateOrderResult,
} from "./orders/OrderEngine";
export {
  ExecutionEngine,
  createExecutionEngine,
} from "./execution/ExecutionEngine";
export type { ExecutionResult } from "./execution/ExecutionEngine";
export {
  MatchingEngine,
  createMatchingEngine,
} from "./matching/MatchingEngine";
export type { MatchResult, MatchOptions } from "./matching/MatchingEngine";
export { buildPosition, buildPositions } from "./positionEngine";
export { PaperBroker } from "./brokers/PaperBroker";
export { usePortfolioEngine } from "./usePortfolioEngine";
export {
  AsyncPortfolioStorage,
  MemoryPortfolioStorage,
  createEmptyPersistedState,
  getDefaultPortfolioStorage,
} from "./storage/portfolioStorage";
export type { Broker } from "./brokers/Broker";
export type {
  PortfolioBalance,
  PortfolioPosition,
  PortfolioProvider,
  PortfolioSnapshot,
  PortfolioSourceContextValue,
  PortfolioSourceId,
  PortfolioSourceMeta,
  PortfolioSourceType,
  Trade,
  TradeSide,
  TradeSource,
  TradePositionMode,
  Position,
  PositionMode,
  Portfolio,
  PortfolioEngineState,
  PortfolioPersistedState,
  Order,
  Fill,
  BrokerOrderParams,
} from "./types";
export {
  DEFAULT_REDUCE_ONLY_POLICY,
} from "./reduceOnly/ReduceOnlyPolicy";
export type { ReduceOnlyPolicy, ReduceOnlyPolicyMode } from "./reduceOnly/ReduceOnlyPolicy";
export {
  ReduceOnlyValidationError,
  assertReduceOnlyExecution,
  canExecuteReduceOnly,
  clampReduceOnlyQuantity,
  resolveCanReduce,
  resolveMaxReducibleQuantity,
  validateReduceOnly,
  wouldIncreaseExposure,
} from "./reduceOnly/ReduceOnlyValidator";
export type { ReduceOnlyValidationResult } from "./reduceOnly/ReduceOnlyValidator";
export type { ExecutionLiquidity } from "./execution/ExecutionLiquidity";
export { DEFAULT_EXECUTION_LIQUIDITY } from "./execution/ExecutionLiquidity";
export {
  PostOnlyValidationError,
  assertPostOnly,
  canRegisterPostOnly,
  resolveMakerEligible,
  resolvePostOnlySupported,
  validatePostOnly,
  wouldTakeLiquidity,
} from "./postOnly/PostOnlyValidator";
export type { PostOnlyValidationResult } from "./postOnly/PostOnlyValidator";
export {
  resolveLimitExecutionLiquidity,
  resolveMarketExecutionLiquidity,
  resolvePreviewExecutionLiquidity,
} from "./execution/ExecutionLiquidityResolver";
export { feeRateForLiquidity } from "./fees/FeeModel";
export {
  DEFAULT_PERP_ACCOUNT_POSITION_MODE,
  type PerpAccountPositionMode,
  type PositionSide,
} from "./hedge/PerpAccountPositionMode";
export {
  buildHedgePositions,
  accumulateLegFromTrades,
  aggregateHedgeLegMetrics,
  findHedgeLegPosition,
} from "./hedge/hedgePositionEngine";
export {
  resolveTradePositionSide,
  inferPositionSideFromExecution,
  signedQuantityForLeg,
  resolvePositionDisplaySide,
} from "./hedge/resolvePositionSide";
export {
  buildPositionsForAccountMode,
  aggregateOpenPositionMetrics,
} from "./position/positionEngineRouter";
export {
  reduceOnlyQuantityMode,
  resolveReduceOnlyPositionQuantity,
} from "./hedge/resolveReduceOnlyContext";
export {
  createOcoGroupId,
  hydrateOcoGroup,
  isActiveOcoStatus,
  type OcoGroup,
  type OcoGroupSnapshotEntry,
  type OcoGroupStatus,
  type TradeTriggerReason,
} from "./oco/OcoGroup";
export { buildOcoGroupFromOrders, tryBuildOcoGroupFromRegistered } from "./oco/OcoGroupBuilder";
export { OcoValidationError, validateOcoOrderPair } from "./oco/OcoValidator";
export { ocoRuntime, buildOpenOcoGroupSnapshots } from "./oco/OcoRuntime";
export {
  cancelOcoCounterpartOnFill,
  cancelOcoCounterpartOnManualCancel,
  cancelOcoGroupsForFlatPositionLeg,
  resolveTriggerReasonFromOrder,
} from "./oco/OcoCancellation";
export {
  createTrailingStopId,
  hydrateTrailingStop,
  isActiveTrailingStatus,
  closeSideForPositionLeg,
  type TrailingStop,
  type TrailingStopSnapshotEntry,
  type TrailingStopStatus,
} from "./trailing/TrailingStop";
export { buildTrailingStop } from "./trailing/TrailingStopBuilder";
export { TrailingStopValidationError, validateTrailingStopInput } from "./trailing/TrailingStopValidator";
export {
  isTrailingActivated,
  applyTrailingMarkUpdate,
  shouldTriggerTrailing,
  trailingTriggerPrice,
} from "./trailing/TrailingStopEvaluator";
export {
  trailingStopRuntime,
  buildOpenTrailingStopSnapshots,
  TrailingStopRuntime,
} from "./trailing/TrailingStopRuntime";
export {
  createTrailingStopPriceEvaluator,
  TrailingStopPriceEvaluator,
} from "./trailing/TrailingStopPriceEvaluator";
export type { TrailingStopEvaluatorDeps } from "./trailing/TrailingStopPriceEvaluator";
export {
  INSURANCE_FUND_VERSION,
  createEmptyInsuranceFundState,
  hydrateInsuranceFundState,
  type InsuranceFundEvent,
  type InsuranceFundState,
} from "./insurance/InsuranceFund";
export {
  DEFAULT_INSURANCE_FUND_POLICY,
  computeLiquidationDeficit,
  computeLiquidationSurplus,
  type InsuranceFundPolicy,
} from "./insurance/InsuranceFundPolicy";
export {
  resolveInsuranceSettlement,
  createInsurancePayoutFinancialEvent,
  createInsuranceGainFinancialEvent,
  type InsuranceSettlementResult,
  type LiquidationInsuranceInput,
} from "./insurance/InsuranceFundEngine";
export {
  buildInsuranceFundSnapshot,
  computeInsuranceFundDelta24h,
  type InsuranceFundSnapshot,
} from "./insurance/InsuranceFundSnapshot";
export {
  insuranceFundRuntime,
  InsuranceFundRuntime,
} from "./insurance/InsuranceFundRuntime";
export { isSettlementOnlyFinancialEvent } from "./financial/FinancialEventLedger";
