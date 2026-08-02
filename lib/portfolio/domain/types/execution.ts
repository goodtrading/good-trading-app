import type { PerpExecutionIntent } from "@/lib/portfolio/domain/types/perp";
import type { SpotExecutionIntent } from "@/lib/portfolio/domain/types/spot";

export type TradingDomain = "SPOT" | "PERP";

/**
 * Discriminated execution request — sole conceptual entry for future writes.
 * Phase 2: both domains still bridge to the legacy PERP engine path.
 */
export type ExecutionRequest =
  | { domain: "SPOT"; intent: SpotExecutionIntent }
  | { domain: "PERP"; intent: PerpExecutionIntent };
