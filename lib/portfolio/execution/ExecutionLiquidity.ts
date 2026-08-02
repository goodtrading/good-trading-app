/** How an execution interacted with the order book (FASE 12.4+). */
export type ExecutionLiquidity = "MAKER" | "TAKER" | "UNKNOWN";

export const DEFAULT_EXECUTION_LIQUIDITY: ExecutionLiquidity = "UNKNOWN";
